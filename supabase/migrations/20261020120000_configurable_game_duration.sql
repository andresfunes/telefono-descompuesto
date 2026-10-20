-- NULL preserves the complete-game behavior for existing rooms and games.
alter table public.games add column round_limit integer check (round_limit in (4, 6));

create function public.set_game_round_limit(p_code text, p_auth_user_id uuid, p_round_limit integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_game public.games%rowtype;
begin
  if p_round_limit is not null and p_round_limit not in (4, 6) then
    raise exception 'INVALID_ROUND_LIMIT';
  end if;
  select game.* into target_game from public.games game
  join public.players host on host.game_id = game.id and host.id = game.host_player_id and host.is_active
  where game.code = pg_catalog.upper(pg_catalog.btrim(p_code)) and host.auth_user_id = p_auth_user_id
  for update of game;
  if not found then raise exception 'NOT_HOST'; end if;
  if target_game.phase <> 'LOBBY' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if target_game.lobby_expires_at <= pg_catalog.now() then raise exception 'LOBBY_EXPIRED'; end if;
  if target_game.round_limit is not distinct from p_round_limit then return; end if;
  update public.games set round_limit = p_round_limit, version = version + 1 where id = target_game.id;
  perform realtime.send(
    pg_catalog.jsonb_build_object('kind', 'ROUND_LIMIT_CHANGED', 'version', target_game.version + 1),
    'GAME_CHANGED', pg_catalog.concat('game:', target_game.id), true
  );
end;
$$;
revoke all on function public.set_game_round_limit(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.set_game_round_limit(text, uuid, integer) to service_role;

create or replace function public.load_game_snapshot(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'game', pg_catalog.jsonb_build_object(
      'id', g.id,
      'code', g.code,
      'phase', g.phase,
      'host_player_id', g.host_player_id,
      'current_round', g.current_round,
      'current_entry_type', g.current_entry_type,
      'version', g.version,
      'reveal_step', g.reveal_step,
      'round_limit', g.round_limit,
      'created_at', g.created_at,
      'rematch_code', (
        select rematch.code from public.games rematch where rematch.id = g.rematch_game_id
      ),
      'lobby_locked', g.lobby_locked,
      'lobby_expires_at', g.lobby_expires_at
    ),
    'players', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', p.id,
        'auth_user_id', p.auth_user_id,
        'name', p.name,
        'join_order', p.join_order,
        'joined_at', p.joined_at,
        'is_active', p.is_active
      ) order by p.join_order)
      from public.players p where p.game_id = g.id
    ), '[]'::jsonb),
    'chains', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id,
        'origin_player_id', c.origin_player_id,
        'position', c.position
      ) order by c.position)
      from public.chains c where c.game_id = g.id
    ), '[]'::jsonb),
    'entries', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id,
        'chain_id', e.chain_id,
        'player_id', e.player_id,
        'round_number', e.round_number,
        'entry_order', e.entry_order,
        'entry_type', e.entry_type,
        'text_content', e.text_content,
        'drawing_path', e.drawing_path,
        'audio_path', e.audio_path,
        'emoji_content', e.emoji_content,
        'created_at', e.created_at
      ) order by e.chain_id, e.entry_order)
      from public.chain_entries e where e.game_id = g.id
    ), '[]'::jsonb)
  )
  from public.games g
  where g.code = pg_catalog.upper(pg_catalog.btrim(p_code));
$$;


create or replace function public.remove_game_player(
  p_code text,
  p_auth_user_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games%rowtype;
  removed_auth_user_id uuid;
  active_pending_count integer;
  next_round integer;
  event_kind text := 'PLAYER_REMOVED';
begin
  select game.* into target_game
  from public.games game
  join public.players host
    on host.game_id = game.id and host.id = game.host_player_id and host.is_active
  where game.code = pg_catalog.upper(pg_catalog.btrim(p_code))
    and host.auth_user_id = p_auth_user_id
  for update of game;

  if not found then raise exception 'NOT_HOST'; end if;
  if target_game.phase not in ('LOBBY', 'PLAYING') then
    raise exception 'GAME_ALREADY_STARTED';
  end if;
  if target_game.phase = 'LOBBY'
    and target_game.lobby_expires_at <= pg_catalog.now()
  then
    raise exception 'LOBBY_EXPIRED';
  end if;
  if p_player_id = target_game.host_player_id then raise exception 'CANNOT_REMOVE_HOST'; end if;

  select player.auth_user_id into removed_auth_user_id
  from public.players player
  where player.game_id = target_game.id
    and player.id = p_player_id
    and player.is_active
  for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if target_game.phase = 'LOBBY' then
    delete from public.players player
    where player.game_id = target_game.id and player.id = p_player_id;

    insert into private.game_removed_users (game_id, auth_user_id)
    values (target_game.id, removed_auth_user_id)
    on conflict (game_id, auth_user_id) do nothing;
  else
    if exists (
      select 1
      from public.chain_entries entry
      where entry.game_id = target_game.id
        and entry.player_id = p_player_id
        and entry.round_number = target_game.current_round
    ) then
      raise exception 'PLAYER_ALREADY_SUBMITTED';
    end if;

    update public.players
    set is_active = false
    where game_id = target_game.id and id = p_player_id;

    select pg_catalog.count(*)::integer into active_pending_count
    from public.players player
    where player.game_id = target_game.id
      and player.is_active
      and not exists (
        select 1
        from public.chain_entries entry
        where entry.game_id = target_game.id
          and entry.player_id = player.id
          and entry.round_number = target_game.current_round
      );

    if active_pending_count = 0 then
      next_round := target_game.current_round + 1;
      if next_round >= least(coalesce(target_game.round_limit, 12), (
        select pg_catalog.count(*)::integer
        from public.players player
        where player.game_id = target_game.id
      )) then
        update public.games
        set phase = 'REVEAL',
            current_round = null,
            current_entry_type = null,
            version = version + 1
        where id = target_game.id;
        event_kind := 'REVEAL_STARTED';
      else
        update public.games
        set current_round = next_round,
            current_entry_type = case
              when next_round % 2 = 0 then 'text'::public.entry_type
              else 'drawing'::public.entry_type
            end,
            version = version + 1
        where id = target_game.id;
        event_kind := 'ROUND_ADVANCED';
      end if;
    else
      update public.games
      set version = version + 1
      where id = target_game.id;
    end if;
  end if;

  if target_game.phase = 'LOBBY' then
    update public.games
    set version = version + 1
    where id = target_game.id;
  end if;

  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'kind', event_kind, 'version', target_game.version + 1
    ),
    'GAME_CHANGED',
    pg_catalog.concat('game:', target_game.id),
    true
  );
end;
$$;

create or replace function public.create_game_rematch(
  p_source_code text,
  p_auth_user_id uuid,
  p_new_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_game public.games%rowtype;
  source_host public.players%rowtype;
  existing_code text;
  new_game_id uuid := pg_catalog.gen_random_uuid();
  new_player_id uuid := pg_catalog.gen_random_uuid();
  normalized_new_code text := pg_catalog.upper(pg_catalog.btrim(p_new_code));
begin
  select * into source_game
  from public.games
  where code = pg_catalog.upper(pg_catalog.btrim(p_source_code))
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into source_host
  from public.players
  where game_id = source_game.id and id = source_game.host_player_id;

  if source_host.auth_user_id <> p_auth_user_id then
    raise exception 'NOT_HOST';
  end if;

  if source_game.phase not in ('REVEAL', 'FINISHED') then
    raise exception 'GAME_NOT_FINISHED';
  end if;

  if source_game.rematch_game_id is not null then
    select code into existing_code
    from public.games
    where id = source_game.rematch_game_id;
    return existing_code;
  end if;

  insert into public.games (id, code, host_player_id, round_limit)
  values (new_game_id, normalized_new_code, new_player_id, source_game.round_limit);

  insert into public.players (id, game_id, auth_user_id, name, join_order)
  values (
    new_player_id,
    new_game_id,
    p_auth_user_id,
    source_host.name,
    0
  );

  update public.games
  set rematch_game_id = new_game_id, version = version + 1
  where id = source_game.id;

  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'kind',
      'REMATCH_CREATED',
      'code',
      normalized_new_code,
      'version',
      source_game.version + 1
    ),
    'GAME_CHANGED',
    pg_catalog.concat('game:', source_game.id),
    true
  );

  return normalized_new_code;
end;
$$;

create or replace function private.reserve_ai_commentary_generation(
  p_game_id uuid,
  p_auth_user_id uuid,
  p_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_count integer;
  round_count integer;
  has_inactive_players boolean;
  incomplete_chain_count integer;
  existing_lock private.ai_commentary_generation_locks%rowtype;
  current_day date := (pg_catalog.now() at time zone 'UTC')::date;
  daily_usage private.ai_daily_usage%rowtype;
  new_token uuid := pg_catalog.gen_random_uuid();
begin
  if p_daily_limit < 1 then
    raise exception 'INVALID_AI_DAILY_LIMIT';
  end if;

  perform 1
  from public.games game
  join public.players host
    on host.game_id = game.id and host.id = game.host_player_id
  where game.id = p_game_id
    and game.phase = 'REVEAL'
    and host.auth_user_id = p_auth_user_id
  for update of game;

  if not found then
    raise exception 'UNAUTHORIZED_COMMENTARY_GENERATION';
  end if;

  if exists (
    select 1 from public.game_commentaries commentary
    where commentary.game_id = p_game_id
  ) then
    return pg_catalog.jsonb_build_object('status', 'reused');
  end if;

  select pg_catalog.count(*)::integer into player_count
  from public.players player
  where player.game_id = p_game_id;

  select least(player_count, coalesce(game.round_limit, player_count)) into round_count
  from public.games game where game.id = p_game_id;

  select exists (select 1 from public.players where game_id = p_game_id and not is_active)
    into has_inactive_players;

  select pg_catalog.count(*)::integer into incomplete_chain_count
  from public.chains chain
  where chain.game_id = p_game_id
    and (
      select (not has_inactive_players and pg_catalog.count(*) <> round_count)
        or pg_catalog.count(distinct entry.player_id) <> pg_catalog.count(*)
        or pg_catalog.count(distinct entry.round_number) <> pg_catalog.count(*)
        or coalesce(pg_catalog.bool_or(entry.round_number < 0 or entry.round_number >= round_count), false)
      from public.chain_entries entry
      where entry.game_id = p_game_id and entry.chain_id = chain.id
    );

  if player_count < 2
    or (select pg_catalog.count(*) from public.chains where game_id = p_game_id)
      <> player_count
    or incomplete_chain_count <> 0
  then
    raise exception 'INCOMPLETE_COMMENTARY_GAME';
  end if;

  select generation.* into existing_lock
  from private.ai_commentary_generation_locks generation
  where generation.game_id = p_game_id
  for update;

  if found and existing_lock.status = 'PROCESSING'
    and existing_lock.started_at >= pg_catalog.now() - interval '5 minutes'
  then
    return pg_catalog.jsonb_build_object('status', 'in_progress');
  end if;

  if found and existing_lock.status = 'PROCESSING' then
    update private.ai_daily_usage
    set reserved_count = case when reserved_count > 0 then reserved_count - 1 else 0 end,
        updated_at = pg_catalog.now()
    where usage_day = existing_lock.usage_day;
  end if;

  insert into private.ai_daily_usage (usage_day)
  values (current_day)
  on conflict (usage_day) do nothing;

  select usage.* into daily_usage
  from private.ai_daily_usage usage
  where usage.usage_day = current_day
  for update;

  if daily_usage.successful_count + daily_usage.reserved_count >= p_daily_limit then
    return pg_catalog.jsonb_build_object('status', 'daily_cap');
  end if;

  update private.ai_daily_usage
  set reserved_count = reserved_count + 1,
      updated_at = pg_catalog.now()
  where usage_day = current_day;

  insert into private.ai_commentary_generation_locks (
    game_id,
    status,
    reservation_token,
    usage_day,
    started_at,
    completed_at
  ) values (
    p_game_id,
    'PROCESSING',
    new_token,
    current_day,
    pg_catalog.now(),
    null
  )
  on conflict (game_id) do update set
    status = excluded.status,
    reservation_token = excluded.reservation_token,
    usage_day = excluded.usage_day,
    started_at = excluded.started_at,
    completed_at = null;

  return pg_catalog.jsonb_build_object(
    'status', 'allowed',
    'reservation_token', new_token
  );
end;
$$;

