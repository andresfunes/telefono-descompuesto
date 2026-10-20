begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
insert into auth.users (id, email, raw_user_meta_data)
select ('81000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'duration-' || i || '@test.local', '{}'
from generate_series(1, 8) i;
select public.create_game_with_host('DUR234', '81000000-0000-0000-0000-000000000001', 'Host');
select public.join_game('DUR234', ('81000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  'Guest ' || i, 'unavailable', true) from generate_series(2, 8) i;
select is((public.load_game_snapshot('DUR234')->'game'->>'round_limit'), null, 'legacy/default duration is complete');
select throws_ok($$select public.set_game_round_limit('DUR234', '81000000-0000-0000-0000-000000000002', 4)$$,
  'P0001', 'NOT_HOST', 'guests cannot set duration');
select throws_ok($$select public.set_game_round_limit('DUR234', '81000000-0000-0000-0000-000000000001', 5)$$,
  'P0001', 'INVALID_ROUND_LIMIT', 'invalid limit rejected');
select ok(not has_function_privilege('authenticated', 'public.set_game_round_limit(text,uuid,integer)', 'EXECUTE'),
  'clients cannot call privileged setter');
select ok(not has_function_privilege('anon', 'public.set_game_round_limit(text,uuid,integer)', 'EXECUTE'),
  'anonymous role cannot call setter');
select public.set_game_round_limit('DUR234', '81000000-0000-0000-0000-000000000001', 6);
select is((public.load_game_snapshot_for_user('DUR234', '81000000-0000-0000-0000-000000000002')->'game'->>'round_limit')::integer,
  6, 'guest snapshot sees saved duration');
select public.set_game_round_limit('DUR234', '81000000-0000-0000-0000-000000000001', null);
select is((select round_limit from public.games where code = 'DUR234'), null, 'can return to complete');
select public.set_game_round_limit('DUR234', '81000000-0000-0000-0000-000000000001', 4);
update public.games set phase = 'PLAYING', current_round = 3, current_entry_type = 'drawing' where code = 'DUR234';
select throws_ok($$select public.set_game_round_limit('DUR234', '81000000-0000-0000-0000-000000000001', 6)$$,
  'P0001', 'GAME_ALREADY_STARTED', 'duration is immutable once started');
insert into public.chains (id, game_id, origin_player_id, position)
select 'duration-chain-' || p.join_order, p.game_id, p.id, p.join_order
from public.players p join public.games g on g.id = p.game_id where g.code = 'DUR234';
insert into public.chain_entries (id, game_id, chain_id, player_id, round_number, entry_order, entry_type, text_content, drawing_path)
select 'duration-entry-' || p.join_order || '-' || r, p.game_id,
  'duration-chain-' || ((p.join_order - r + 8) % 8), p.id, r, r,
  case when r % 2 = 0 then 'text'::public.entry_type else 'drawing'::public.entry_type end,
  case when r % 2 = 0 then 'Un pingüino' else null end,
  case when r % 2 = 1 then 'games/' || p.game_id || '/' || p.id || '/' || r || '.png' else null end
from public.players p join public.games g on g.id = p.game_id cross join generate_series(0, 3) r
where g.code = 'DUR234';
-- Complete quick games are eligible for AI even though each chain has fewer than N entries.
update public.games set phase = 'REVEAL', current_round = null, current_entry_type = null where code = 'DUR234';
select is((public.reserve_ai_commentary_generation((select id from public.games where code = 'DUR234'),
  '81000000-0000-0000-0000-000000000001', 1000)->>'status'), 'allowed', 'AI accepts a complete four-round game');
-- Simulate a final missing submission, then remove that player through the real RPC.
update public.games set phase = 'PLAYING', current_round = 3, current_entry_type = 'drawing' where code = 'DUR234';
delete from public.chain_entries where id = 'duration-entry-7-3';
select public.remove_game_player('DUR234', '81000000-0000-0000-0000-000000000001',
  (select id from public.players where auth_user_id = '81000000-0000-0000-0000-000000000008'));
select is((select phase::text from public.games where code = 'DUR234'), 'REVEAL', 'removal finishes at configured limit');
select is((select reveal_step from public.games where code = 'DUR234'), -1, 'quick game starts synchronized reveal');
select is((public.reserve_ai_commentary_generation((select id from public.games where code = 'DUR234'),
  '81000000-0000-0000-0000-000000000001', 1000)->>'status'), 'in_progress', 'AI accepts valid skipped turns');
select public.create_game_rematch('DUR234', '81000000-0000-0000-0000-000000000001', 'DUR235');
select is((select round_limit from public.games where code = 'DUR235'), 4, 'rematch retains duration preference');
update public.games set lobby_expires_at = now() - interval '1 minute' where code = 'DUR235';
select throws_ok($$select public.set_game_round_limit('DUR235', '81000000-0000-0000-0000-000000000001', 6)$$,
  'P0001', 'LOBBY_EXPIRED', 'expired lobby cannot change duration');
select is((select count(*)::integer from public.chains c join public.games g on c.game_id = g.id where g.code = 'DUR234'),
  8, 'quick mode retains all player chains');
select * from finish();
rollback;
