begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

select has_table('public', 'games', 'games table exists');
select has_table('public', 'players', 'players table exists');
select has_table('public', 'chains', 'chains table exists');
select has_table('public', 'chain_entries', 'chain_entries table exists');
select has_table('public', 'game_commentaries', 'game_commentaries table exists');
select has_schema('private', 'private helper schema exists');
select has_index('public', 'games', 'games_code_key', 'room codes are unique');
select has_index(
  'public',
  'chain_entries',
  'chain_entries_game_id_player_id_round_number_key',
  'a player can submit once per round'
);
select results_eq(
  $$select count(*) from pg_catalog.pg_class
    where oid in (
      'public.games'::pg_catalog.regclass,
      'public.players'::pg_catalog.regclass,
      'public.chains'::pg_catalog.regclass,
      'public.chain_entries'::pg_catalog.regclass,
      'public.game_commentaries'::pg_catalog.regclass
    ) and relrowsecurity$$,
  array[5::bigint],
  'RLS is enabled on all game tables'
);

select results_eq(
  $$select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'is_game_member',
        'can_reveal_game',
        'can_access_game_topic'
      )$$,
  array[0::bigint],
  'RLS helpers are not in the exposed public schema'
);
select results_eq(
  $$select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname in (
        'is_game_member',
        'can_reveal_game',
        'can_access_game_topic'
      )
      and procedure.prosecdef$$,
  array[3::bigint],
  'all RLS helpers are SECURITY DEFINER functions in private'
);
select results_eq(
  $$select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prosecdef
      and 'search_path=""' = any(procedure.proconfig)$$,
  array[14::bigint],
  'every application SECURITY DEFINER function has an empty search_path'
);
select results_eq(
  $$select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and (
        pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
      )$$,
  array[0::bigint],
  'no exposed SECURITY DEFINER function is executable by browser roles'
);
select results_eq(
  $$select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname in (
        'is_game_member',
        'can_reveal_game',
        'can_access_game_topic'
      )
      and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')$$,
  array[3::bigint],
  'authenticated can execute private helpers for RLS evaluation'
);
select results_eq(
  $$select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname in (
        'is_game_member',
        'can_reveal_game',
        'can_access_game_topic'
      )
      and pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')$$,
  array[0::bigint],
  'anon cannot execute private RLS helpers'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.commit_game_snapshot(uuid,bigint,public.game_phase,integer,public.entry_type,jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the authoritative commit function'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.save_game_commentary(uuid,uuid,jsonb,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the commentary save function'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', 'one@test.local', '{}'),
  ('10000000-0000-0000-0000-000000000002', 'two@test.local', '{}'),
  ('10000000-0000-0000-0000-000000000003', 'three@test.local', '{}');

select lives_ok(
  $$select public.create_game_with_host(
    'TST3',
    '10000000-0000-0000-0000-000000000001',
    'Ana'
  )$$,
  'the hardened create game RPC remains operational'
);
select lives_ok(
  $$select public.join_game(
    'TST3',
    '10000000-0000-0000-0000-000000000002',
    'Beto'
  )$$,
  'the hardened join game RPC remains operational'
);

set constraints all deferred;
insert into public.games (id, code, host_player_id)
values (
  '20000000-0000-0000-0000-000000000001',
  'TST2',
  '30000000-0000-0000-0000-000000000001'
);
insert into public.players (id, game_id, auth_user_id, name, join_order)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Ana',
    0
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'Beto',
    1
  );
insert into public.chains (id, game_id, origin_player_id, position)
values (
  'chain-test',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  0
);
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
values (
  'entry-test',
  '20000000-0000-0000-0000-000000000001',
  'chain-test',
  '30000000-0000-0000-0000-000000000001',
  0,
  0,
  'text',
  'Una prueba escondida'
);

select throws_ok(
  $$select public.save_game_commentary(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '["comentario"]'::jsonb,
    'STANDARD'
  )$$,
  'P0001',
  'UNAUTHORIZED_COMMENTARY_GENERATION',
  'only the room creator can save commentary'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  $$select count(*) from public.games
    where id = '20000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'a member can read their game'
);
select results_eq(
  $$select count(*) from public.players
    where game_id = '20000000-0000-0000-0000-000000000001'$$,
  array[2::bigint],
  'a member can read the player list'
);
select ok(
  private.is_game_member('20000000-0000-0000-0000-000000000001'),
  'membership helper allows a game member'
);
select ok(
  not private.can_reveal_game('20000000-0000-0000-0000-000000000001'),
  'reveal helper denies access while the game is in the lobby'
);
select results_eq(
  'select count(*) from public.chains',
  array[0::bigint],
  'chains remain hidden before reveal'
);
select results_eq(
  'select count(*) from public.chain_entries',
  array[0::bigint],
  'entries remain hidden before reveal'
);
select ok(
  private.can_access_game_topic(
    'game:20000000-0000-0000-0000-000000000001'
  ),
  'a member can access their realtime topic'
);
select ok(
  not private.can_access_game_topic(
    'game:20000000-0000-0000-0000-000000000099'
  ),
  'a member cannot access another realtime topic'
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
select ok(
  not private.is_game_member('20000000-0000-0000-0000-000000000001'),
  'membership helper denies a non-member'
);
select ok(
  not private.can_access_game_topic(
    'game:20000000-0000-0000-0000-000000000001'
  ),
  'a non-member cannot access the game realtime topic'
);

reset role;
update public.games
set phase = 'REVEAL'
where id = '20000000-0000-0000-0000-000000000001';
select public.save_game_commentary(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '["comentario compartido"]'::jsonb,
  'STANDARD'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select ok(
  private.can_reveal_game('20000000-0000-0000-0000-000000000001'),
  'reveal helper allows a member during reveal'
);
select results_eq(
  'select count(*) from public.chains',
  array[1::bigint],
  'a member can read chains during reveal'
);
select results_eq(
  'select count(*) from public.chain_entries',
  array[1::bigint],
  'a member can read entries during reveal'
);
select results_eq(
  'select count(*) from public.game_commentaries',
  array[1::bigint],
  'a member can read revealed commentary'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000003',
  true
);
select ok(
  not private.can_reveal_game('20000000-0000-0000-0000-000000000001'),
  'reveal helper still denies a non-member during reveal'
);
select results_eq(
  'select count(*) from public.chains',
  array[0::bigint],
  'a non-member cannot read revealed chains'
);
select results_eq(
  'select count(*) from public.chain_entries',
  array[0::bigint],
  'a non-member cannot read revealed entries'
);
select results_eq(
  'select count(*) from public.game_commentaries',
  array[0::bigint],
  'a non-member cannot read commentary'
);

select * from finish();
rollback;
