begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
insert into auth.users (id, email, raw_user_meta_data) values
  ('71000000-0000-0000-0000-000000000001', 'reveal-host@test.local', '{}'),
  ('71000000-0000-0000-0000-000000000002', 'reveal-guest@test.local', '{}');
select public.create_game_with_host('REV234', '71000000-0000-0000-0000-000000000001', 'Host');
select public.join_game('REV234', '71000000-0000-0000-0000-000000000002', 'Guest', 'unavailable', true);
insert into public.chains (id, game_id, origin_player_id, position)
select 'reveal-chain', id, host_player_id, 0 from public.games where code = 'REV234';
insert into public.chain_entries (id, game_id, chain_id, player_id, round_number, entry_order, entry_type, text_content)
select 'reveal-entry', id, 'reveal-chain', host_player_id, 0, 0, 'text', 'Secret original'
from public.games where code = 'REV234';
select throws_ok($$select public.set_game_reveal_step('REV234', '71000000-0000-0000-0000-000000000001', null, 0)$$,
  'P0001', 'NOT_REVEAL', 'cannot reveal during the lobby');
update public.games set phase = 'PLAYING', current_round = 0, current_entry_type = 'text' where code = 'REV234';
update public.games set phase = 'REVEAL', current_round = null, current_entry_type = null where code = 'REV234';
select is((select reveal_step from public.games where code = 'REV234'), -1, 'new reveals start waiting');
select is((public.load_game_snapshot('REV234')->'game'->>'reveal_step')::integer, -1, 'snapshot persists cursor');
select throws_ok($$select public.set_game_reveal_step('REV234', '71000000-0000-0000-0000-000000000002', -1, 0)$$,
  'P0001', 'NOT_HOST', 'guest cannot control reveal');
select throws_ok($$select public.set_game_reveal_step('REV234', '71000000-0000-0000-0000-000000000001', -1, 2)$$,
  'P0001', 'INVALID_STEP', 'rejects past-end cursor');
select ok(not has_function_privilege('authenticated', 'public.set_game_reveal_step(text,uuid,integer,integer)', 'EXECUTE'),
  'browser cannot invoke privileged mutation');
select ok(not has_function_privilege('anon', 'public.set_game_reveal_step(text,uuid,integer,integer)', 'EXECUTE'),
  'anonymous role cannot invoke privileged mutation');
select ok(public.set_game_reveal_step('REV234', '71000000-0000-0000-0000-000000000001', -1, 0), 'host reveals first card');
select ok(not public.set_game_reveal_step('REV234', '71000000-0000-0000-0000-000000000001', -1, 1), 'stale request does not skip card');
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*)::integer from public.chain_entries), 0, 'direct reads cannot bypass presentation');
reset role;
select ok(public.set_game_reveal_step('REV234', '71000000-0000-0000-0000-000000000001', 0, 1), 'host opens summary');
set local role authenticated;
select is((select count(*)::integer from public.chain_entries), 1, 'summary allows member reads');
reset role;
select ok(public.set_game_reveal_step('REV234', '71000000-0000-0000-0000-000000000001', 1, -1), 'host can restart presentation');
select is((public.load_game_snapshot_for_user('REV234', '71000000-0000-0000-0000-000000000002')->'game'->>'reveal_step')::integer,
  -1, 'reconnecting guest receives authoritative cursor');
select * from finish();
rollback;
