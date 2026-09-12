alter table public.games drop constraint games_code_format;
alter table public.games
  add constraint games_code_format check (
    code = pg_catalog.upper(code)
    and code ~ '^([A-HJ-NP-Z2-9]{4}|[A-HJ-NP-Z2-9]{6})$'
  );

alter table public.games
  add column lobby_locked boolean not null default false,
  add column lobby_expires_at timestamptz;

update public.games
set lobby_expires_at = created_at + interval '2 hours'
where lobby_expires_at is null;

alter table public.games
  alter column lobby_expires_at set default (pg_catalog.now() + interval '2 hours'),
  alter column lobby_expires_at set not null;

create table private.game_join_attempts (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text not null,
  room_code text not null,
  outcome text not null check (
    outcome in ('joined', 'unavailable', 'name_taken', 'challenge_required', 'rate_limited')
  ),
  attempted_at timestamptz not null default pg_catalog.now(),
  constraint game_join_attempts_ip_hash check (
    ip_hash = 'unavailable' or ip_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint game_join_attempts_room_code check (
    room_code ~ '^([A-HJ-NP-Z2-9]{4}|[A-HJ-NP-Z2-9]{6})$'
  )
);

create index game_join_attempts_user_window_idx
  on private.game_join_attempts (auth_user_id, attempted_at desc);
create index game_join_attempts_ip_window_idx
  on private.game_join_attempts (ip_hash, attempted_at desc);
create index game_join_attempts_code_window_idx
  on private.game_join_attempts (room_code, attempted_at desc);

revoke all on table private.game_join_attempts
  from public, anon, authenticated, service_role;
revoke all on sequence private.game_join_attempts_id_seq
  from public, anon, authenticated, service_role;

create table private.game_removed_users (
  game_id uuid not null references public.games(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  removed_at timestamptz not null default pg_catalog.now(),
  primary key (game_id, auth_user_id)
);

revoke all on table private.game_removed_users
  from public, anon, authenticated, service_role;

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
        'joined_at', p.joined_at
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
  );
$$;

drop function public.join_game(text, uuid, text);

create function public.join_game(
  p_code text,
  p_auth_user_id uuid,
  p_player_name text,
  p_ip_hash text default 'unavailable',
  p_challenge_verified boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := pg_catalog.upper(pg_catalog.btrim(p_code));
  normalized_name text := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_player_name), '\\s+', ' ', 'g'
  );
  target_game public.games%rowtype;
  existing_player_id uuid;
  new_player_id uuid := pg_catalog.gen_random_uuid();
  next_join_order integer;
  player_count integer;
  user_failures_hour integer;
  ip_failures_hour integer := 0;
  code_failures_hour integer;
  user_failures_short integer;
  ip_failures_short integer := 0;
  code_failures_short integer;
  last_failure timestamptz;
  cooldown_minutes integer := 0;
begin
  if normalized_code !~ '^([A-HJ-NP-Z2-9]{4}|[A-HJ-NP-Z2-9]{6})$'
    or p_ip_hash is null
    or (p_ip_hash <> 'unavailable' and p_ip_hash !~ '^[0-9a-f]{64}$')
  then
    return 'unavailable';
  end if;

  select game.* into target_game
  from public.games game
  where game.code = normalized_code;

  if found then
    select player.id into existing_player_id
    from public.players player
    where player.game_id = target_game.id
      and player.auth_user_id = p_auth_user_id;
    if existing_player_id is not null then
      return 'joined';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(lock_name, 0)
  )
  from pg_catalog.unnest(array[
    pg_catalog.concat('join-code:', normalized_code),
    pg_catalog.concat('join-ip:', p_ip_hash),
    pg_catalog.concat('join-user:', p_auth_user_id::text)
  ]) lock_name
  order by lock_name;

  select
    pg_catalog.count(*) filter (
      where attempt.auth_user_id = p_auth_user_id
        and attempt.attempted_at >= pg_catalog.now() - interval '1 hour'
    )::integer,
    pg_catalog.count(*) filter (
      where attempt.room_code = normalized_code
        and attempt.attempted_at >= pg_catalog.now() - interval '1 hour'
    )::integer,
    pg_catalog.count(*) filter (
      where attempt.auth_user_id = p_auth_user_id
        and attempt.attempted_at >= pg_catalog.now() - interval '10 minutes'
    )::integer,
    pg_catalog.count(*) filter (
      where attempt.room_code = normalized_code
        and attempt.attempted_at >= pg_catalog.now() - interval '10 minutes'
    )::integer,
    pg_catalog.max(attempt.attempted_at)
  into
    user_failures_hour,
    code_failures_hour,
    user_failures_short,
    code_failures_short,
    last_failure
  from private.game_join_attempts attempt
  where attempt.outcome <> 'joined'
    and (
      attempt.auth_user_id = p_auth_user_id
      or attempt.room_code = normalized_code
      or (p_ip_hash <> 'unavailable' and attempt.ip_hash = p_ip_hash)
    );

  if p_ip_hash <> 'unavailable' then
    select
      pg_catalog.count(*) filter (
        where attempted_at >= pg_catalog.now() - interval '1 hour'
      )::integer,
      pg_catalog.count(*) filter (
        where attempted_at >= pg_catalog.now() - interval '10 minutes'
      )::integer
    into ip_failures_hour, ip_failures_short
    from private.game_join_attempts
    where outcome <> 'joined' and ip_hash = p_ip_hash;
  end if;

  select pg_catalog.max(candidate.value) into cooldown_minutes
  from pg_catalog.unnest(array[
    case
      when user_failures_hour >= 30 then 60
      when user_failures_hour >= 20 then 15
      when user_failures_hour >= 12 then 5
      else 0
    end,
    case
      when ip_failures_hour >= 100 then 60
      when ip_failures_hour >= 60 then 15
      when ip_failures_hour >= 40 then 5
      else 0
    end,
    case
      when code_failures_hour >= 60 then 60
      when code_failures_hour >= 40 then 15
      when code_failures_hour >= 25 then 5
      else 0
    end
  ]) candidate(value);

  if cooldown_minutes > 0
    and last_failure + pg_catalog.make_interval(mins => cooldown_minutes) > pg_catalog.now()
  then
    insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
    values (p_auth_user_id, p_ip_hash, normalized_code, 'rate_limited');
    return 'rate_limited';
  end if;

  if not p_challenge_verified and (
    user_failures_short >= 3
    or ip_failures_short >= 8
    or code_failures_short >= 5
  ) then
    insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
    values (p_auth_user_id, p_ip_hash, normalized_code, 'challenge_required');
    return 'challenge_required';
  end if;

  select game.* into target_game
  from public.games game
  where game.code = normalized_code
  for update;

  if not found
    or target_game.phase <> 'LOBBY'
    or target_game.lobby_locked
    or target_game.lobby_expires_at <= pg_catalog.now()
    or exists (
      select 1 from private.game_removed_users removed
      where removed.game_id = target_game.id
        and removed.auth_user_id = p_auth_user_id
    )
  then
    insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
    values (p_auth_user_id, p_ip_hash, normalized_code, 'unavailable');
    return 'unavailable';
  end if;

  select pg_catalog.count(*)::integer into player_count
  from public.players player where player.game_id = target_game.id;
  if player_count >= 12 then
    insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
    values (p_auth_user_id, p_ip_hash, normalized_code, 'unavailable');
    return 'unavailable';
  end if;

  if exists (
    select 1 from public.players player
    where player.game_id = target_game.id
      and pg_catalog.lower(player.name) = pg_catalog.lower(normalized_name)
  ) then
    insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
    values (p_auth_user_id, p_ip_hash, normalized_code, 'name_taken');
    return 'name_taken';
  end if;

  select coalesce(pg_catalog.max(player.join_order), -1) + 1
  into next_join_order
  from public.players player where player.game_id = target_game.id;

  insert into public.players (id, game_id, auth_user_id, name, join_order)
  values (new_player_id, target_game.id, p_auth_user_id, normalized_name, next_join_order);

  update public.games set version = version + 1 where id = target_game.id;
  insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
  values (p_auth_user_id, p_ip_hash, normalized_code, 'joined');

  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'kind', 'PLAYER_JOINED', 'version', target_game.version + 1
    ),
    'GAME_CHANGED',
    pg_catalog.concat('game:', target_game.id),
    true
  );
  return 'joined';
end;
$$;

create or replace function public.set_game_lobby_locked(
  p_code text,
  p_auth_user_id uuid,
  p_locked boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games%rowtype;
begin
  select game.* into target_game
  from public.games game
  join public.players host
    on host.game_id = game.id and host.id = game.host_player_id
  where game.code = pg_catalog.upper(pg_catalog.btrim(p_code))
    and host.auth_user_id = p_auth_user_id
  for update of game;

  if not found then raise exception 'NOT_HOST'; end if;
  if target_game.phase <> 'LOBBY' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if target_game.lobby_expires_at <= pg_catalog.now() then raise exception 'LOBBY_EXPIRED'; end if;

  update public.games
  set lobby_locked = p_locked, version = version + 1
  where id = target_game.id;

  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'kind', 'LOBBY_LOCK_CHANGED', 'version', target_game.version + 1
    ),
    'GAME_CHANGED', pg_catalog.concat('game:', target_game.id), true
  );
end;
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
begin
  select game.* into target_game
  from public.games game
  join public.players host
    on host.game_id = game.id and host.id = game.host_player_id
  where game.code = pg_catalog.upper(pg_catalog.btrim(p_code))
    and host.auth_user_id = p_auth_user_id
  for update of game;

  if not found then raise exception 'NOT_HOST'; end if;
  if target_game.phase <> 'LOBBY' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if target_game.lobby_expires_at <= pg_catalog.now() then raise exception 'LOBBY_EXPIRED'; end if;
  if p_player_id = target_game.host_player_id then raise exception 'CANNOT_REMOVE_HOST'; end if;

  delete from public.players player
  where player.game_id = target_game.id and player.id = p_player_id
  returning player.auth_user_id into removed_auth_user_id;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  insert into private.game_removed_users (game_id, auth_user_id)
  values (target_game.id, removed_auth_user_id)
  on conflict (game_id, auth_user_id) do nothing;

  update public.games set version = version + 1 where id = target_game.id;
  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'kind', 'PLAYER_REMOVED', 'version', target_game.version + 1
    ),
    'GAME_CHANGED', pg_catalog.concat('game:', target_game.id), true
  );
end;
$$;

create or replace function private.enforce_game_start_constraints()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  player_count integer;
begin
  if old.phase = 'LOBBY' and new.phase = 'PLAYING' then
    if old.lobby_expires_at <= pg_catalog.now() then
      raise exception 'LOBBY_EXPIRED';
    end if;
    select pg_catalog.count(*)::integer into player_count
    from public.players player where player.game_id = old.id;
    if player_count < 2 then raise exception 'TOO_FEW_PLAYERS'; end if;
    if player_count > 12 then raise exception 'TOO_MANY_PLAYERS'; end if;
  end if;
  return new;
end;
$$;

create trigger enforce_game_start_constraints
before update of phase on public.games
for each row execute function private.enforce_game_start_constraints();

revoke execute on function public.load_game_snapshot_for_user(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.join_game(text, uuid, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.set_game_lobby_locked(text, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.remove_game_player(text, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.enforce_game_start_constraints()
  from public, anon, authenticated, service_role;

grant execute on function public.load_game_snapshot_for_user(text, uuid) to service_role;
grant execute on function public.join_game(text, uuid, text, text, boolean) to service_role;
grant execute on function public.set_game_lobby_locked(text, uuid, boolean) to service_role;
grant execute on function public.remove_game_player(text, uuid, uuid) to service_role;
