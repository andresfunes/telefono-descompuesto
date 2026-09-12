create table private.ai_commentary_attempts (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text not null,
  attempted_at timestamptz not null default pg_catalog.now(),
  constraint ai_commentary_attempts_ip_hash check (
    ip_hash = 'unavailable' or ip_hash ~ '^[0-9a-f]{64}$'
  )
);

create index ai_commentary_attempts_user_window_idx
  on private.ai_commentary_attempts (auth_user_id, attempted_at desc);
create index ai_commentary_attempts_ip_window_idx
  on private.ai_commentary_attempts (ip_hash, attempted_at desc);
create index ai_commentary_attempts_game_idx
  on private.ai_commentary_attempts (game_id);

create table private.ai_daily_usage (
  usage_day date primary key,
  reserved_count integer not null default 0 check (reserved_count >= 0),
  successful_count integer not null default 0 check (successful_count >= 0),
  updated_at timestamptz not null default pg_catalog.now()
);

create table private.ai_commentary_generation_locks (
  game_id uuid primary key references public.games(id) on delete cascade,
  status text not null check (status in ('PROCESSING', 'FAILED', 'COMPLETED')),
  reservation_token uuid not null,
  usage_day date not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  constraint ai_commentary_generation_completion check (
    (status = 'COMPLETED' and completed_at is not null)
    or (status <> 'COMPLETED' and completed_at is null)
  )
);

revoke all on table private.ai_commentary_attempts
  from public, anon, authenticated, service_role;
revoke all on table private.ai_daily_usage
  from public, anon, authenticated, service_role;
revoke all on table private.ai_commentary_generation_locks
  from public, anon, authenticated, service_role;
revoke all on sequence private.ai_commentary_attempts_id_seq
  from public, anon, authenticated, service_role;

grant usage on schema private to service_role;

create or replace function private.record_ai_commentary_attempt(
  p_game_id uuid,
  p_auth_user_id uuid,
  p_ip_hash text,
  p_user_limit integer,
  p_ip_limit integer,
  p_game_limit integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_count integer;
begin
  if p_user_limit < 1 or p_ip_limit < 1 or p_game_limit < 1
    or p_ip_hash is null
    or (p_ip_hash <> 'unavailable' and p_ip_hash !~ '^[0-9a-f]{64}$')
  then
    raise exception 'INVALID_AI_RATE_LIMIT';
  end if;

  select pg_catalog.count(*)::integer into player_count
  from public.players player
  join public.games game
    on game.id = player.game_id
   and game.host_player_id = player.id
  where game.id = p_game_id
    and game.phase = 'REVEAL'
    and player.auth_user_id = p_auth_user_id;

  if player_count <> 1 then
    raise exception 'UNAUTHORIZED_COMMENTARY_GENERATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(lock_name, 0)
  )
  from pg_catalog.unnest(array[
    pg_catalog.concat('ai-game:', p_game_id::text),
    pg_catalog.concat('ai-ip:', p_ip_hash),
    pg_catalog.concat('ai-user:', p_auth_user_id::text)
  ]) lock_name
  order by lock_name;

  if (
    select pg_catalog.count(*)
    from private.ai_commentary_attempts attempt
    where attempt.auth_user_id = p_auth_user_id
      and attempt.attempted_at >= pg_catalog.now() - interval '1 hour'
  ) >= p_user_limit then
    return 'rate_limited:user';
  end if;

  if (
    select pg_catalog.count(*)
    from private.ai_commentary_attempts attempt
    where attempt.ip_hash = p_ip_hash
      and attempt.attempted_at >= pg_catalog.now() - interval '1 hour'
  ) >= p_ip_limit then
    return 'rate_limited:ip';
  end if;

  if (
    select pg_catalog.count(*)
    from private.ai_commentary_attempts attempt
    where attempt.game_id = p_game_id
  ) >= p_game_limit then
    return 'rate_limited:game';
  end if;

  insert into private.ai_commentary_attempts (
    game_id,
    auth_user_id,
    ip_hash
  ) values (
    p_game_id,
    p_auth_user_id,
    p_ip_hash
  );

  return 'allowed';
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

  select pg_catalog.count(*)::integer into incomplete_chain_count
  from public.chains chain
  where chain.game_id = p_game_id
    and (
      select pg_catalog.count(*) <> player_count
        or pg_catalog.count(distinct entry.player_id) <> player_count
        or pg_catalog.count(distinct entry.round_number) <> player_count
        or pg_catalog.min(entry.round_number) <> 0
        or pg_catalog.max(entry.round_number) <> player_count - 1
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

create or replace function private.complete_ai_commentary(
  p_game_id uuid,
  p_auth_user_id uuid,
  p_reservation_token uuid,
  p_comments jsonb,
  p_intensity text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games%rowtype;
  generation private.ai_commentary_generation_locks%rowtype;
  saved_at timestamptz;
begin
  select commentary.generated_at into saved_at
  from public.game_commentaries commentary
  where commentary.game_id = p_game_id;

  if found then
    return (
      select pg_catalog.jsonb_build_object(
        'comments', commentary.comments,
        'intensity', commentary.intensity,
        'generated_at', commentary.generated_at
      )
      from public.game_commentaries commentary
      where commentary.game_id = p_game_id
    );
  end if;

  select game.* into target_game
  from public.games game
  join public.players host
    on host.game_id = game.id and host.id = game.host_player_id
  where game.id = p_game_id
    and game.phase = 'REVEAL'
    and host.auth_user_id = p_auth_user_id
  for update of game;

  select lock.* into generation
  from private.ai_commentary_generation_locks lock
  where lock.game_id = p_game_id
    and lock.status = 'PROCESSING'
    and lock.reservation_token = p_reservation_token
  for update;

  if target_game.id is null or generation.game_id is null then
    raise exception 'INVALID_COMMENTARY_RESERVATION';
  end if;

  if p_comments is null
    or pg_catalog.jsonb_typeof(p_comments) <> 'array'
    or pg_catalog.jsonb_array_length(p_comments) not between 1 and 8
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_comments) item
      where pg_catalog.jsonb_typeof(item) <> 'string'
        or pg_catalog.length(pg_catalog.btrim(item #>> '{}')) = 0
    )
  then
    raise exception 'INVALID_COMMENTARY';
  end if;

  if p_intensity is null or p_intensity not in ('GENTLE', 'STANDARD', 'STRONG') then
    raise exception 'INVALID_COMMENTARY_INTENSITY';
  end if;

  insert into public.game_commentaries (
    game_id,
    comments,
    intensity,
    generated_by_player_id,
    generated_at
  ) values (
    p_game_id,
    p_comments,
    p_intensity,
    target_game.host_player_id,
    pg_catalog.now()
  )
  on conflict (game_id) do nothing
  returning generated_at into saved_at;

  update private.ai_daily_usage
  set reserved_count = case when reserved_count > 0 then reserved_count - 1 else 0 end,
      successful_count = successful_count + 1,
      updated_at = pg_catalog.now()
  where usage_day = generation.usage_day;

  update private.ai_commentary_generation_locks
  set status = 'COMPLETED', completed_at = pg_catalog.now()
  where game_id = p_game_id and reservation_token = p_reservation_token;

  perform realtime.send(
    pg_catalog.jsonb_build_object('kind', 'COMMENTARY_GENERATED'),
    'GAME_CHANGED',
    pg_catalog.concat('game:', p_game_id::text),
    true
  );

  return pg_catalog.jsonb_build_object(
    'comments', p_comments,
    'intensity', p_intensity,
    'generated_at', saved_at
  );
end;
$$;

create or replace function private.fail_ai_commentary_generation(
  p_game_id uuid,
  p_reservation_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved_day date;
begin
  update private.ai_commentary_generation_locks
  set status = 'FAILED'
  where game_id = p_game_id
    and status = 'PROCESSING'
    and reservation_token = p_reservation_token
  returning usage_day into reserved_day;

  if reserved_day is not null then
    update private.ai_daily_usage
    set reserved_count = case when reserved_count > 0 then reserved_count - 1 else 0 end,
        updated_at = pg_catalog.now()
    where usage_day = reserved_day;
  end if;
end;
$$;

create or replace function public.record_ai_commentary_attempt(
  p_game_id uuid,
  p_auth_user_id uuid,
  p_ip_hash text,
  p_user_limit integer,
  p_ip_limit integer,
  p_game_limit integer
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_ai_commentary_attempt(
    p_game_id,
    p_auth_user_id,
    p_ip_hash,
    p_user_limit,
    p_ip_limit,
    p_game_limit
  );
$$;

create or replace function public.reserve_ai_commentary_generation(
  p_game_id uuid,
  p_auth_user_id uuid,
  p_daily_limit integer
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.reserve_ai_commentary_generation(
    p_game_id,
    p_auth_user_id,
    p_daily_limit
  );
$$;

create or replace function public.complete_ai_commentary(
  p_game_id uuid,
  p_auth_user_id uuid,
  p_reservation_token uuid,
  p_comments jsonb,
  p_intensity text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.complete_ai_commentary(
    p_game_id,
    p_auth_user_id,
    p_reservation_token,
    p_comments,
    p_intensity
  );
$$;

create or replace function public.fail_ai_commentary_generation(
  p_game_id uuid,
  p_reservation_token uuid
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.fail_ai_commentary_generation(
    p_game_id,
    p_reservation_token
  );
$$;

revoke execute on function public.save_game_commentary(uuid, uuid, jsonb, text)
  from service_role;

revoke all on function public.record_ai_commentary_attempt(
  uuid, uuid, text, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.reserve_ai_commentary_generation(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_ai_commentary(
  uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function public.fail_ai_commentary_generation(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.record_ai_commentary_attempt(
  uuid, uuid, text, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function private.reserve_ai_commentary_generation(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.complete_ai_commentary(
  uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function private.fail_ai_commentary_generation(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.record_ai_commentary_attempt(
  uuid, uuid, text, integer, integer, integer
) to service_role;
grant execute on function public.reserve_ai_commentary_generation(uuid, uuid, integer)
  to service_role;
grant execute on function public.complete_ai_commentary(
  uuid, uuid, uuid, jsonb, text
) to service_role;
grant execute on function public.fail_ai_commentary_generation(uuid, uuid)
  to service_role;
grant execute on function private.record_ai_commentary_attempt(
  uuid, uuid, text, integer, integer, integer
) to service_role;
grant execute on function private.reserve_ai_commentary_generation(uuid, uuid, integer)
  to service_role;
grant execute on function private.complete_ai_commentary(
  uuid, uuid, uuid, jsonb, text
) to service_role;
grant execute on function private.fail_ai_commentary_generation(uuid, uuid)
  to service_role;
