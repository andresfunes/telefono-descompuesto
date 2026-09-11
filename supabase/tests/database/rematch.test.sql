begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

select has_column('public', 'games', 'rematch_game_id', 'games can reference a rematch');
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_game_rematch(text,uuid,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot create rematches directly'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.create_game_rematch(text,uuid,text)',
    'EXECUTE'
  ),
  'anonymous clients cannot create rematches directly'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11000000-0000-0000-0000-000000000001', 'host@test.local', '{}'),
  ('11000000-0000-0000-0000-000000000002', 'guest@test.local', '{}');

select public.create_game_with_host(
  'RMA2',
  '11000000-0000-0000-0000-000000000001',
  'Ana'
);
select public.join_game(
  'RMA2',
  '11000000-0000-0000-0000-000000000002',
  'Beto'
);

select throws_ok(
  $$select public.create_game_rematch(
    'RMA2',
    '11000000-0000-0000-0000-000000000001',
    'NEW2'
  )$$,
  'P0001',
  'GAME_NOT_FINISHED',
  'the host cannot create a rematch before reveal'
);

update public.games set phase = 'REVEAL' where code = 'RMA2';

select throws_ok(
  $$select public.create_game_rematch(
    'RMA2',
    '11000000-0000-0000-0000-000000000002',
    'NEW2'
  )$$,
  'P0001',
  'NOT_HOST',
  'a non-host cannot create a rematch'
);
select lives_ok(
  $$select public.create_game_rematch(
    'RMA2',
    '11000000-0000-0000-0000-000000000001',
    'NEW2'
  )$$,
  'the host can create a rematch after reveal'
);
select results_eq(
  $$select rematch.code
    from public.games source
    join public.games rematch on rematch.id = source.rematch_game_id
    where source.code = 'RMA2'$$,
  array['NEW2'::text],
  'the finished game points to the new room'
);
select results_eq(
  $$select player.name || ':' || player.auth_user_id::text
    from public.players player
    join public.games game on game.id = player.game_id
    where game.code = 'NEW2'$$,
  array['Ana:11000000-0000-0000-0000-000000000001'::text],
  'the organizer keeps their name and membership in the new room'
);
select results_eq(
  $$select phase::text from public.games where code = 'NEW2'$$,
  array['LOBBY'::text],
  'the rematch starts in the lobby'
);
select results_eq(
  $$select public.create_game_rematch(
    'RMA2',
    '11000000-0000-0000-0000-000000000001',
    'ALT2'
  )$$,
  array['NEW2'::text],
  'repeated creation returns the existing rematch'
);
select results_eq(
  $$select count(*) from public.games where code in ('NEW2', 'ALT2')$$,
  array[1::bigint],
  'repeated creation does not create another room'
);

select * from finish();
rollback;
