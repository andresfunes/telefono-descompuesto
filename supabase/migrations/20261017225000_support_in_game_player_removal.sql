alter table public.players
  add column is_active boolean not null default true;

create or replace function private.is_game_member(check_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where game_id = check_game_id
      and auth_user_id = (select auth.uid())
      and is_active
  );
$$;

create or replace function private.can_access_game_topic(check_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where auth_user_id = (select auth.uid())
      and is_active
      and check_topic = pg_catalog.concat('game:', game_id)
  );
$$;

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

create or replace function public.load_game_snapshot_for_user(
  p_code text,
  p_auth_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.load_game_snapshot(p_code)
  where exists (
    select 1
    from public.games game
    join public.players player on player.game_id = game.id
    where game.code = pg_catalog.upper(pg_catalog.btrim(p_code))
      and player.auth_user_id = p_auth_user_id
      and player.is_active
  );
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
      if next_round >= (
        select pg_catalog.count(*)::integer
        from public.players player
        where player.game_id = target_game.id
      ) then
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

revoke execute on function public.load_game_snapshot(text)
  from public, anon, authenticated;
revoke execute on function public.load_game_snapshot_for_user(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.remove_game_player(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.load_game_snapshot(text) to service_role;
grant execute on function public.load_game_snapshot_for_user(text, uuid) to service_role;
grant execute on function public.remove_game_player(text, uuid, uuid) to service_role;

revoke execute on function private.is_game_member(uuid)
  from public, anon, service_role;
revoke execute on function private.can_access_game_topic(text)
  from public, anon, service_role;
grant execute on function private.is_game_member(uuid) to authenticated;
grant execute on function private.can_access_game_topic(text) to authenticated;
