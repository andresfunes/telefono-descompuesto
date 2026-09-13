create table private.product_events (
  id bigint generated always as identity primary key,
  event_name text not null check (
    event_name in (
      'room_created',
      'room_joined',
      'game_started',
      'first_submission',
      'game_finished',
      'rematch_created'
    )
  ),
  occurred_at timestamptz not null default pg_catalog.now(),
  game_id uuid not null,
  subject_id uuid,
  related_game_id uuid,
  player_count smallint check (player_count between 1 and 12),
  round_count smallint check (round_count between 1 and 12),
  deduplication_key text generated always as (
    event_name || ':' || game_id::text ||
    case
      when event_name = 'room_joined' then ':' || subject_id::text
      else ''
    end
  ) stored,
  constraint product_events_shape check (
    (
      event_name = 'room_joined'
      and subject_id is not null
      and related_game_id is null
    )
    or (
      event_name = 'rematch_created'
      and subject_id is null
      and related_game_id is not null
    )
    or (
      event_name not in ('room_joined', 'rematch_created')
      and subject_id is null
      and related_game_id is null
    )
  ),
  constraint product_events_deduplication_key_key unique (deduplication_key)
);

comment on table private.product_events is
  'Append-only, privacy-conscious product funnel events. Starts collecting when this migration is applied.';
comment on column private.product_events.game_id is
  'Random game UUID used for funnel correlation; room codes and user-generated content are never stored.';
comment on column private.product_events.subject_id is
  'Random per-game player UUID, present only to deduplicate room_joined; never an auth user id.';

create index product_events_occurred_at_idx
  on private.product_events (occurred_at desc);
create index product_events_name_occurred_at_idx
  on private.product_events (event_name, occurred_at desc);
create index product_events_game_id_idx
  on private.product_events (game_id);

alter table private.product_events enable row level security;

revoke all on table private.product_events
  from public, anon, authenticated, service_role;
revoke all on sequence private.product_events_id_seq
  from public, anon, authenticated, service_role;

create function private.record_product_event(
  p_event_name text,
  p_game_id uuid,
  p_subject_id uuid default null,
  p_related_game_id uuid default null,
  p_player_count integer default null,
  p_round_count integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.product_events (
    event_name,
    game_id,
    subject_id,
    related_game_id,
    player_count,
    round_count
  )
  values (
    p_event_name,
    p_game_id,
    p_subject_id,
    p_related_game_id,
    p_player_count,
    p_round_count
  )
  on conflict (deduplication_key) do nothing;
exception
  when others then
    raise warning 'Product analytics event % failed for game %: %',
      p_event_name,
      p_game_id,
      sqlerrm;
end;
$$;

create function private.capture_room_created_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.record_product_event(
    'room_created',
    new.id,
    null,
    null,
    1,
    null
  );
  return new;
exception
  when others then
    raise warning 'Room creation analytics failed for game %: %', new.id, sqlerrm;
    return new;
end;
$$;

create function private.capture_player_joined_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player_count integer;
begin
  select pg_catalog.count(*)::integer into current_player_count
  from public.players player
  where player.game_id = new.game_id;

  perform private.record_product_event(
    'room_joined',
    new.game_id,
    new.id,
    null,
    current_player_count,
    null
  );
  return new;
exception
  when others then
    raise warning 'Player join analytics failed for game %: %', new.game_id, sqlerrm;
    return new;
end;
$$;

create function private.capture_first_submission_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player_count integer;
begin
  select pg_catalog.count(*)::integer into current_player_count
  from public.players player
  where player.game_id = new.game_id;

  perform private.record_product_event(
    'first_submission',
    new.game_id,
    null,
    null,
    current_player_count,
    null
  );
  return new;
exception
  when others then
    raise warning 'Submission analytics failed for game %: %', new.game_id, sqlerrm;
    return new;
end;
$$;

create function private.capture_game_transition_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player_count integer;
  completed_round_count integer;
begin
  select pg_catalog.count(*)::integer into current_player_count
  from public.players player
  where player.game_id = new.id;

  if old.phase = 'LOBBY' and new.phase = 'PLAYING' then
    perform private.record_product_event(
      'game_started',
      new.id,
      null,
      null,
      current_player_count,
      null
    );
  end if;

  if old.phase = 'PLAYING' and new.phase in ('REVEAL', 'FINISHED') then
    select pg_catalog.count(distinct entry.round_number)::integer
    into completed_round_count
    from public.chain_entries entry
    where entry.game_id = new.id;

    perform private.record_product_event(
      'game_finished',
      new.id,
      null,
      null,
      current_player_count,
      completed_round_count
    );
  end if;

  if old.rematch_game_id is null and new.rematch_game_id is not null then
    perform private.record_product_event(
      'rematch_created',
      new.id,
      null,
      new.rematch_game_id,
      current_player_count,
      null
    );
  end if;

  return new;
exception
  when others then
    raise warning 'Game transition analytics failed for game %: %', new.id, sqlerrm;
    return new;
end;
$$;

create trigger capture_room_created_product_event
after insert on public.games
for each row execute function private.capture_room_created_event();

create trigger capture_player_joined_product_event
after insert on public.players
for each row execute function private.capture_player_joined_event();

create trigger capture_first_submission_product_event
after insert on public.chain_entries
for each row execute function private.capture_first_submission_event();

create trigger capture_game_transition_product_events
after update of phase, rematch_game_id on public.games
for each row execute function private.capture_game_transition_events();

revoke all on function private.record_product_event(text, uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.capture_room_created_event()
  from public, anon, authenticated, service_role;
revoke all on function private.capture_player_joined_event()
  from public, anon, authenticated, service_role;
revoke all on function private.capture_first_submission_event()
  from public, anon, authenticated, service_role;
revoke all on function private.capture_game_transition_events()
  from public, anon, authenticated, service_role;

create function public.get_product_funnel(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rooms_created bigint;
  players_joined bigint;
  games_started bigint;
  games_finished bigint;
  rematches_created bigint;
  average_started_players numeric;
  daily_counts jsonb;
begin
  if p_days < 1 or p_days > 90 then
    raise exception 'INVALID_ANALYTICS_RANGE';
  end if;

  select
    pg_catalog.count(*) filter (where event.event_name = 'room_created'),
    pg_catalog.count(*) filter (where event.event_name = 'room_joined'),
    pg_catalog.count(*) filter (where event.event_name = 'game_started'),
    pg_catalog.count(*) filter (where event.event_name = 'game_finished'),
    pg_catalog.count(*) filter (where event.event_name = 'rematch_created'),
    coalesce(
      pg_catalog.round(
        pg_catalog.avg(event.player_count) filter (
          where event.event_name = 'game_started'
        ),
        2
      ),
      0
    )
  into
    rooms_created,
    players_joined,
    games_started,
    games_finished,
    rematches_created,
    average_started_players
  from private.product_events event;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'date', day.value::date::text,
      'room_created', coalesce(counts.room_created, 0),
      'room_joined', coalesce(counts.room_joined, 0),
      'game_started', coalesce(counts.game_started, 0),
      'first_submission', coalesce(counts.first_submission, 0),
      'game_finished', coalesce(counts.game_finished, 0),
      'rematch_created', coalesce(counts.rematch_created, 0)
    )
    order by day.value
  )
  into daily_counts
  from pg_catalog.generate_series(
    (pg_catalog.now() at time zone 'UTC')::date - (p_days - 1),
    (pg_catalog.now() at time zone 'UTC')::date,
    interval '1 day'
  ) day(value)
  left join lateral (
    select
      pg_catalog.count(*) filter (where event.event_name = 'room_created') as room_created,
      pg_catalog.count(*) filter (where event.event_name = 'room_joined') as room_joined,
      pg_catalog.count(*) filter (where event.event_name = 'game_started') as game_started,
      pg_catalog.count(*) filter (where event.event_name = 'first_submission') as first_submission,
      pg_catalog.count(*) filter (where event.event_name = 'game_finished') as game_finished,
      pg_catalog.count(*) filter (where event.event_name = 'rematch_created') as rematch_created
    from private.product_events event
    where event.occurred_at >= day.value
      and event.occurred_at < day.value + interval '1 day'
  ) counts on true;

  return pg_catalog.jsonb_build_object(
    'summary', pg_catalog.jsonb_build_object(
      'rooms_created', rooms_created,
      'players_joined', players_joined,
      'games_started', games_started,
      'games_finished', games_finished,
      'rematches_created', rematches_created,
      'start_conversion', case
        when rooms_created = 0 then 0
        else pg_catalog.round(games_started * 100.0 / rooms_created, 1)
      end,
      'finish_conversion', case
        when games_started = 0 then 0
        else pg_catalog.round(games_finished * 100.0 / games_started, 1)
      end,
      'rematch_conversion', case
        when games_finished = 0 then 0
        else pg_catalog.round(rematches_created * 100.0 / games_finished, 1)
      end,
      'average_started_players', average_started_players
    ),
    'daily', coalesce(daily_counts, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_product_funnel(integer)
  from public, anon, authenticated;
grant execute on function public.get_product_funnel(integer) to service_role;
