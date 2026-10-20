begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('61000000-0000-0000-0000-000000000001', 'afk-host@test.local', '{}'),
  ('61000000-0000-0000-0000-000000000002', 'afk-player@test.local', '{}');

select public.create_game_with_host(
  'AFK223',
  '61000000-0000-0000-0000-000000000001',
  'Host'
);
select public.join_game(
  'AFK223',
  '61000000-0000-0000-0000-000000000002',
  'Ausente',
  'unavailable',
  true
);

update public.games
set phase = 'PLAYING', current_round = 0, current_entry_type = 'text'
where code = 'AFK223';

insert into public.chains (id, game_id, origin_player_id, position)
select
  'chain:' || host.id::text,
  game.id,
  host.id,
  0
from public.games game
join public.players host
  on host.game_id = game.id and host.id = game.host_player_id
where game.code = 'AFK223';

savepoint before_host_submission;

insert into public.chain_entries (
  id,
  game_id,
  chain_id,
  player_id,
  round_number,
  entry_order,
  entry_type,
  text_content
)
select
  'entry:host:round:0',
  game.id,
  'chain:' || host.id::text,
  host.id,
  0,
  0,
  'text',
  'Frase inicial'
from public.games game
join public.players host
  on host.game_id = game.id and host.id = game.host_player_id
where game.code = 'AFK223';

select lives_ok(
  $$select public.remove_game_player(
    'AFK223',
    '61000000-0000-0000-0000-000000000001',
    (
      select id from public.players
      where game_id = (select id from public.games where code = 'AFK223')
        and auth_user_id = '61000000-0000-0000-0000-000000000002'
    )
  )$$,
  'the host can expel a pending player during a game'
);

select results_eq(
  $$select is_active::text from public.players
    where auth_user_id = '61000000-0000-0000-0000-000000000002'$$,
  array['false'::text],
  'an expelled player remains in history but is inactive'
);

select results_eq(
  $$select phase::text from public.games where code = 'AFK223'$$,
  array['REVEAL'::text],
  'the game ends when only one active player remains'
);

select results_eq(
  $$select (public.load_game_snapshot_for_user(
    'AFK223', '61000000-0000-0000-0000-000000000002'
  ) is null)::text$$,
  array['true'::text],
  'an expelled player loses access to the game snapshot'
);

select set_config(
  'test.afk_game_id',
  (select id::text from public.games where code = 'AFK223'),
  true
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '61000000-0000-0000-0000-000000000002',
  true
);
select ok(
  not private.can_access_game_topic(
    'game:' || pg_catalog.current_setting('test.afk_game_id')
  ),
  'an expelled player loses access to realtime updates'
);

rollback to savepoint before_host_submission;

select lives_ok(
  $$select public.remove_game_player('AFK223',
    '61000000-0000-0000-0000-000000000001',
    (select id from public.players
      where game_id = (select id from public.games where code = 'AFK223')
      and auth_user_id = '61000000-0000-0000-0000-000000000002'))$$,
  'the host can remove the last opponent before submitting'
);
select results_eq(
  $$select phase::text from public.games where code = 'AFK223'$$,
  array['REVEAL'::text], 'a pending host does not keep playing alone'
);
select ok(
  (select current_round is null and current_entry_type is null and reveal_step = -1
   from public.games where code = 'AFK223'),
  'early completion clears the round and initializes synchronized reveal'
);
select is(
  (select count(*)::integer from public.chains where game_id =
    (select id from public.games where code = 'AFK223')),
  1, 'early completion preserves existing chains'
);

select results_eq(
  $$select round_count::integer from private.product_events
    where game_id = (select id from public.games where code = 'AFK223')
      and event_name = 'game_finished'$$,
  array[0], 'finishing before any submissions records zero rounds'
);
select * from finish();
rollback;
