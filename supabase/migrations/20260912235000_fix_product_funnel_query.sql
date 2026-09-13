create or replace function public.get_product_funnel(p_days integer default 7)
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
