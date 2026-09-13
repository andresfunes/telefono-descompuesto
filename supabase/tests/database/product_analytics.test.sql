begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

select has_table(
  'private',
  'product_events',
  'product funnel events live outside the exposed public schema'
);
select results_eq(
  $$select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'private.product_events'::pg_catalog.regclass$$,
  array[true],
  'RLS is enabled on product events'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.product_events', 'SELECT'),
  'authenticated clients cannot read product events'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.product_events', 'INSERT'),
  'authenticated clients cannot insert product events'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'private.product_events', 'INSERT'),
  'anonymous clients cannot insert product events'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.get_product_funnel(integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot query funnel metrics'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.get_product_funnel(integer)',
    'EXECUTE'
  ),
  'anonymous clients cannot query funnel metrics'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.get_product_funnel(integer)',
    'EXECUTE'
  ),
  'the trusted server role can query funnel metrics'
);
select results_eq(
  $$select index.indisunique
    from pg_catalog.pg_index index
    where index.indexrelid =
      'private.product_events_deduplication_key_key'::pg_catalog.regclass$$,
  array[true],
  'the database enforces semantic event uniqueness under concurrent writes'
);

set local role authenticated;
select throws_ok(
  $$insert into private.product_events (event_name, game_id)
    values ('room_created', '12000000-0000-0000-0000-000000000099')$$,
  '42501',
  'permission denied for table product_events',
  'browser users cannot forge arbitrary product events'
);
reset role;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('12000000-0000-0000-0000-000000000001', 'analytics-host@test.local', '{}'),
  ('12000000-0000-0000-0000-000000000002', 'analytics-guest@test.local', '{}'),
  ('12000000-0000-0000-0000-000000000003', 'analytics-failure@test.local', '{}');

select public.create_game_with_host(
  'FUNNEL',
  '12000000-0000-0000-0000-000000000001',
  'Ana'
);

select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'FUNNEL' and event.event_name = 'room_created'$$,
  array[1::bigint],
  'room_created is emitted exactly once after room creation'
);
select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'FUNNEL' and event.event_name = 'room_joined'$$,
  array[1::bigint],
  'creating the host membership emits one room_joined event'
);

select results_eq(
  $$select public.join_game(
    'FUNNEL',
    '12000000-0000-0000-0000-000000000002',
    'Beto',
    'unavailable',
    true
  )$$,
  array['joined'::text],
  'a real player can join the room'
);
select results_eq(
  $$select public.join_game(
    'FUNNEL',
    '12000000-0000-0000-0000-000000000002',
    'Beto',
    'unavailable',
    true
  )$$,
  array['joined'::text],
  'a refresh or retry returns the existing membership'
);
select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'FUNNEL' and event.event_name = 'room_joined'$$,
  array[2::bigint],
  'room_joined exists once for each real membership, including the host'
);
select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    join public.players player on player.id = event.subject_id
    where game.code = 'FUNNEL'
      and event.event_name = 'room_joined'
      and player.auth_user_id = '12000000-0000-0000-0000-000000000002'$$,
  array[1::bigint],
  'refreshing does not emit a second room_joined event'
);

update public.games
set phase = 'PLAYING', current_round = 0, current_entry_type = 'text'
where code = 'FUNNEL';
update public.games set phase = 'PLAYING' where code = 'FUNNEL';

select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'FUNNEL' and event.event_name = 'game_started'$$,
  array[1::bigint],
  'game_started is emitted only for the LOBBY to PLAYING transition'
);

insert into public.chains (id, game_id, origin_player_id, position)
select
  'funnel-chain-' || player.join_order,
  game.id,
  player.id,
  player.join_order
from public.games game
join public.players player on player.game_id = game.id
where game.code = 'FUNNEL';

insert into public.chain_entries (
  id,
  game_id,
  chain_id,
  player_id,
  round_number,
  entry_order,
  entry_type,
  text_content,
  drawing_path
)
select
  input.id,
  game.id,
  input.chain_id,
  player.id,
  input.round_number,
  input.entry_order,
  input.entry_type::public.entry_type,
  input.text_content,
  input.drawing_path
from public.games game
join (
  values
    ('funnel-entry-1', 'funnel-chain-0', 0, 0, 0, 'text', 'Frase uno', null),
    ('funnel-entry-2', 'funnel-chain-1', 1, 0, 0, 'text', 'Frase dos', null),
    ('funnel-entry-3', 'funnel-chain-0', 1, 1, 1, 'drawing', null, 'drawings/3.png'),
    ('funnel-entry-4', 'funnel-chain-1', 0, 1, 1, 'drawing', null, 'drawings/4.png')
) input(
  id,
  chain_id,
  player_order,
  round_number,
  entry_order,
  entry_type,
  text_content,
  drawing_path
) on true
join public.players player
  on player.game_id = game.id and player.join_order = input.player_order
where game.code = 'FUNNEL';

select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'FUNNEL' and event.event_name = 'first_submission'$$,
  array[1::bigint],
  'first_submission is emitted once for the first persisted entry only'
);

update public.games
set phase = 'REVEAL', current_round = null, current_entry_type = null
where code = 'FUNNEL';
update public.games set phase = 'FINISHED' where code = 'FUNNEL';

select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'FUNNEL' and event.event_name = 'game_finished'$$,
  array[1::bigint],
  'game_finished is emitted once when PLAYING reaches the reveal end state'
);
select results_eq(
  $$select event.round_count::integer
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'FUNNEL' and event.event_name = 'game_finished'$$,
  array[2],
  'game_finished records the completed round count'
);

select lives_ok(
  $$select public.create_game_rematch(
    'FUNNEL',
    '12000000-0000-0000-0000-000000000001',
    'REMAT2'
  )$$,
  'the host can create a rematch after the game finishes'
);
select results_eq(
  $$select public.create_game_rematch(
    'FUNNEL',
    '12000000-0000-0000-0000-000000000001',
    'OTHER2'
  )$$,
  array['REMAT2'::text],
  'a retry returns the existing rematch'
);
select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'FUNNEL' and event.event_name = 'rematch_created'$$,
  array[1::bigint],
  'rematch_created is emitted exactly once despite retries'
);
select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'REMAT2' and event.event_name = 'room_created'$$,
  array[1::bigint],
  'a rematch emits room_created for the new room'
);
select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'REMAT2' and event.event_name = 'room_joined'$$,
  array[1::bigint],
  'the rematch host membership emits room_joined once'
);

select private.record_product_event(
  'game_started',
  (select id from public.games where code = 'FUNNEL'),
  null,
  null,
  2,
  null
);
select private.record_product_event(
  'game_started',
  (select id from public.games where code = 'FUNNEL'),
  null,
  null,
  2,
  null
);
select results_eq(
  $$select pg_catalog.count(*)
    from private.product_events event
    join public.games game on game.id = event.game_id
    where game.code = 'FUNNEL' and event.event_name = 'game_started'$$,
  array[1::bigint],
  'repeated or concurrent event writes are idempotent'
);

select results_eq(
  $$select
      (summary.value->>'rooms_created') || ':' ||
      (summary.value->>'players_joined') || ':' ||
      (summary.value->>'games_started') || ':' ||
      (summary.value->>'games_finished') || ':' ||
      (summary.value->>'rematches_created')
    from (
      select public.get_product_funnel(7)->'summary' as value
    ) summary$$,
  array['2:3:1:1:1'::text],
  'the query helper returns all-time funnel totals'
);
select results_eq(
  $$select public.get_product_funnel(7)->'summary'->>'average_started_players'$$,
  array['2.00'::text],
  'the query helper returns average players for started games'
);
select results_eq(
  $$select pg_catalog.jsonb_array_length(public.get_product_funnel(7)->'daily')$$,
  array[7],
  'the query helper returns seven zero-filled UTC days'
);

create function pg_temp.reject_product_event()
returns trigger
language plpgsql
as $$
begin
  raise exception 'SIMULATED_ANALYTICS_FAILURE';
end;
$$;
create trigger reject_product_event
before insert on private.product_events
for each row execute function pg_temp.reject_product_event();

select lives_ok(
  $$select public.create_game_with_host(
    'SAFE22',
    '12000000-0000-0000-0000-000000000003',
    'Cata'
  )$$,
  'analytics insertion failure does not break a valid game action'
);
select results_eq(
  $$select pg_catalog.count(*) from public.games where code = 'SAFE22'$$,
  array[1::bigint],
  'the game remains persisted when analytics recording fails'
);

drop trigger reject_product_event on private.product_events;

select * from finish();
rollback;
