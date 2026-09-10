begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'games', 'games table exists');
select has_table('public', 'players', 'players table exists');
select has_table('public', 'chains', 'chains table exists');
select has_table('public', 'chain_entries', 'chain_entries table exists');
select has_index('public', 'games', 'games_code_key', 'room codes are unique');
select has_index(
  'public',
  'chain_entries',
  'chain_entries_game_id_player_id_round_number_key',
  'a player can submit once per round'
);
select results_eq(
  $$select count(*) from pg_class
    where oid in (
      'public.games'::regclass,
      'public.players'::regclass,
      'public.chains'::regclass,
      'public.chain_entries'::regclass
    ) and relrowsecurity$$,
  array[4::bigint],
  'RLS is enabled on all game tables'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', 'one@test.local', '{}'),
  ('10000000-0000-0000-0000-000000000002', 'two@test.local', '{}'),
  ('10000000-0000-0000-0000-000000000003', 'three@test.local', '{}');

select public.create_game_with_host(
  'TST2',
  '10000000-0000-0000-0000-000000000001',
  'Ana'
);
select public.join_game(
  'TST2',
  '10000000-0000-0000-0000-000000000002',
  'Beto'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.commit_game_snapshot(uuid,bigint,public.game_phase,integer,public.entry_type,jsonb,jsonb,text)',
    'execute'
  ),
  'authenticated clients cannot call the authoritative commit function'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  'select count(*) from public.games',
  array[1::bigint],
  'a member can read their game'
);
select results_eq(
  'select count(*) from public.players',
  array[2::bigint],
  'a member can read the player list'
);
select results_eq(
  $$with changed as (
      update public.games set phase = 'FINISHED' returning 1
    ) select count(*) from changed$$,
  array[0::bigint],
  'a browser session cannot mutate game state'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000003',
  true
);
select results_eq(
  'select count(*) from public.games',
  array[0::bigint],
  'a non-member cannot read a room by guessing its code'
);

select * from finish();
rollback;
