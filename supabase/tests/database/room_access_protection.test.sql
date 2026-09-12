begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table(
  'private',
  'game_join_attempts',
  'join attempts are persisted outside the exposed schema'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.game_join_attempts', 'SELECT'),
  'browser roles cannot inspect join protection data'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.join_game(text,uuid,text,text,boolean)',
    'EXECUTE'
  ),
  'authenticated clients cannot bypass the server join action'
);

insert into auth.users (id, email, raw_user_meta_data)
select
  ('11000000-0000-0000-0000-' || pg_catalog.lpad(number::text, 12, '0'))::uuid,
  'room-' || number::text || '@test.local',
  '{}'
from pg_catalog.generate_series(1, 30) number;

select lives_ok(
  $$select public.create_game_with_host(
    'RSEC42',
    '11000000-0000-0000-0000-000000000001',
    'Ana'
  )$$,
  'six-character rooms can be created'
);
select results_eq(
  $$select (public.load_game_snapshot_for_user(
    'RSEC42', '11000000-0000-0000-0000-000000000001'
  ) is not null)::text$$,
  array['true'::text],
  'members can load the room snapshot'
);
select results_eq(
  $$select (public.load_game_snapshot_for_user(
    'RSEC42', '11000000-0000-0000-0000-000000000002'
  ) is null)::text$$,
  array['true'::text],
  'non-members cannot use a direct URL to discover a room'
);

select results_eq(
  $$select public.join_game(
    'ZZZ222', '11000000-0000-0000-0000-000000000002', 'Beto'
  )$$,
  array['unavailable'::text],
  'an unknown room returns the generic unavailable result'
);
select results_eq(
  $$select public.join_game(
    'ZZZ223', '11000000-0000-0000-0000-000000000002', 'Beto'
  )$$,
  array['unavailable'::text],
  'a second failed user attempt remains generic'
);
select results_eq(
  $$select public.join_game(
    'ZZZ224', '11000000-0000-0000-0000-000000000002', 'Beto'
  )$$,
  array['unavailable'::text],
  'a third failed user attempt remains generic'
);
select results_eq(
  $$select public.join_game(
    'RSEC42', '11000000-0000-0000-0000-000000000002', 'Beto'
  )$$,
  array['challenge_required'::text],
  'repeated user failures trigger an adaptive challenge'
);
select results_eq(
  $$select public.join_game(
    'RSEC42',
    '11000000-0000-0000-0000-000000000002',
    'Beto',
    'unavailable',
    true
  )$$,
  array['joined'::text],
  'a server-verified challenge allows a valid join'
);

insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
select
  ('11000000-0000-0000-0000-' || pg_catalog.lpad(number::text, 12, '0'))::uuid,
  pg_catalog.repeat('a', 64),
  'PTEST2',
  'unavailable'
from pg_catalog.generate_series(3, 10) number;

select results_eq(
  $$select public.join_game(
    'RSEC42',
    '11000000-0000-0000-0000-000000000011',
    'Cata',
    repeat('a', 64),
    false
  )$$,
  array['challenge_required'::text],
  'failures from one IP trigger an adaptive challenge'
);

insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
select
  ('11000000-0000-0000-0000-' || pg_catalog.lpad(number::text, 12, '0'))::uuid,
  pg_catalog.repeat(pg_catalog.substr('bcdef', number - 11, 1), 64),
  'CDE422',
  'unavailable'
from pg_catalog.generate_series(12, 16) number;

select results_eq(
  $$select public.join_game(
    'CDE422',
    '11000000-0000-0000-0000-000000000017',
    'Dani',
    repeat('f', 64),
    false
  )$$,
  array['challenge_required'::text],
  'targeted failures against one code trigger an adaptive challenge'
);

insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
select
  '11000000-0000-0000-0000-000000000018',
  'unavailable',
  'BLCK22',
  'unavailable'
from pg_catalog.generate_series(0, 9) number;

insert into private.game_join_attempts (auth_user_id, ip_hash, room_code, outcome)
values
  ('11000000-0000-0000-0000-000000000018', 'unavailable', 'BLCK22', 'unavailable'),
  ('11000000-0000-0000-0000-000000000018', 'unavailable', 'BLCK22', 'unavailable');

select results_eq(
  $$select public.join_game(
    'RSEC42',
    '11000000-0000-0000-0000-000000000018',
    'Ema',
    'unavailable',
    true
  )$$,
  array['rate_limited'::text],
  'continued abuse receives an escalating cooldown even after a challenge'
);

select lives_ok(
  $$select public.set_game_lobby_locked(
    'RSEC42', '11000000-0000-0000-0000-000000000001', true
  )$$,
  'the host can lock the lobby'
);
select results_eq(
  $$select public.join_game(
    'RSEC42',
    '11000000-0000-0000-0000-000000000003',
    'Fede',
    'unavailable',
    true
  )$$,
  array['unavailable'::text],
  'new players receive the generic result while the lobby is locked'
);
select results_eq(
  $$select public.join_game(
    'RSEC42',
    '11000000-0000-0000-0000-000000000002',
    'Beto',
    'unavailable',
    false
  )$$,
  array['joined'::text],
  'existing members can resume a locked lobby'
);
select throws_ok(
  $$select public.set_game_lobby_locked(
    'RSEC42', '11000000-0000-0000-0000-000000000002', false
  )$$,
  'P0001',
  'NOT_HOST',
  'non-hosts cannot unlock the lobby'
);
select lives_ok(
  $$select public.set_game_lobby_locked(
    'RSEC42', '11000000-0000-0000-0000-000000000001', false
  )$$,
  'the host can unlock the lobby'
);
select throws_ok(
  $$select public.remove_game_player(
    'RSEC42',
    '11000000-0000-0000-0000-000000000001',
    (select host_player_id from public.games where code = 'RSEC42')
  )$$,
  'P0001',
  'CANNOT_REMOVE_HOST',
  'the host cannot remove themselves'
);
select lives_ok(
  $$select public.remove_game_player(
    'RSEC42',
    '11000000-0000-0000-0000-000000000001',
    (select id from public.players
      where auth_user_id = '11000000-0000-0000-0000-000000000002'
        and game_id = (select id from public.games where code = 'RSEC42'))
  )$$,
  'the host can remove another player before the game starts'
);
select results_eq(
  $$select (public.load_game_snapshot_for_user(
    'RSEC42', '11000000-0000-0000-0000-000000000002'
  ) is null)::text$$,
  array['true'::text],
  'a removed player immediately loses snapshot access'
);
select results_eq(
  $$select public.join_game(
    'RSEC42',
    '11000000-0000-0000-0000-000000000002',
    'Beto',
    'unavailable',
    true
  )$$,
  array['unavailable'::text],
  'a removed player cannot immediately rejoin the same lobby'
);

select public.create_game_with_host(
  'MAX223', '11000000-0000-0000-0000-000000000001', 'Host'
);
insert into public.players (game_id, auth_user_id, name, join_order)
select
  (select id from public.games where code = 'MAX223'),
  ('11000000-0000-0000-0000-' || pg_catalog.lpad(number::text, 12, '0'))::uuid,
  'Player ' || number::text,
  number - 1
from pg_catalog.generate_series(2, 12) number;

select results_eq(
  $$select public.join_game(
    'MAX223',
    '11000000-0000-0000-0000-000000000013',
    'Player 13',
    'unavailable',
    true
  )$$,
  array['unavailable'::text],
  'the thirteenth player cannot join'
);

select public.create_game_with_host(
  'LDV223', '11000000-0000-0000-0000-000000000020', 'Old Host'
);
update public.games
set lobby_expires_at = pg_catalog.now() - interval '1 minute'
where code = 'LDV223';
select results_eq(
  $$select public.join_game(
    'LDV223',
    '11000000-0000-0000-0000-000000000021',
    'Late Player',
    'unavailable',
    true
  )$$,
  array['unavailable'::text],
  'expired lobbies do not accept new players'
);
select throws_ok(
  $$update public.games set phase = 'PLAYING', current_round = 0,
      current_entry_type = 'text'
    where code = 'LDV223'$$,
  'P0001',
  'LOBBY_EXPIRED',
  'an expired lobby cannot be started through another server path'
);

select * from finish();
rollback;
