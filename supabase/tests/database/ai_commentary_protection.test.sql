begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

select has_table('private', 'ai_commentary_attempts', 'AI attempts are persisted privately');
select has_table('private', 'ai_daily_usage', 'daily AI usage is persisted privately');
select has_table('private', 'ai_commentary_generation_locks', 'generation locks are persisted privately');
select results_eq(
  $$select count(*)
    from information_schema.role_table_grants
    where table_schema = 'private'
      and table_name like 'ai_%'
      and grantee in ('anon', 'authenticated')$$,
  array[0::bigint],
  'browser roles have no direct abuse-control table privileges'
);
select results_eq(
  $$select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'record_ai_commentary_attempt',
        'reserve_ai_commentary_generation',
        'complete_ai_commentary',
        'fail_ai_commentary_generation'
      )
      and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')$$,
  array[0::bigint],
  'authenticated users cannot execute AI protection RPCs'
);
select results_eq(
  $$select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'record_ai_commentary_attempt',
        'reserve_ai_commentary_generation',
        'complete_ai_commentary',
        'fail_ai_commentary_generation'
      )
      and pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')$$,
  array[4::bigint],
  'only the server service role can execute AI protection RPCs'
);
select ok(
  pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE'),
  'the service role can resolve tightly scoped private helpers'
);
select ok(
  not pg_catalog.has_function_privilege(
    'service_role',
    'public.save_game_commentary(uuid,uuid,jsonb,text)',
    'EXECUTE'
  ),
  'the legacy unprotected commentary writer is disabled for the service role'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11000000-0000-0000-0000-000000000001', 'ai-host@test.local', '{}'),
  ('11000000-0000-0000-0000-000000000002', 'ai-member@test.local', '{}');

set constraints all deferred;
insert into public.games (id, code, phase, host_player_id)
values
  (
    '21000000-0000-0000-0000-000000000001',
    'ATG2',
    'REVEAL',
    '31000000-0000-0000-0000-000000000001'
  ),
  (
    '21000000-0000-0000-0000-000000000002',
    'ATG3',
    'REVEAL',
    '31000000-0000-0000-0000-000000000003'
  ),
  (
    '21000000-0000-0000-0000-000000000003',
    'ATG4',
    'REVEAL',
    '31000000-0000-0000-0000-000000000005'
  );

insert into public.players (id, game_id, auth_user_id, name, join_order)
values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ana', 0),
  ('31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'Beto', 1),
  ('31000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'Ana', 0),
  ('31000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'Beto', 1),
  ('31000000-0000-0000-0000-000000000005', '21000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'Ana', 0),
  ('31000000-0000-0000-0000-000000000006', '21000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', 'Beto', 1);

insert into public.chains (id, game_id, origin_player_id, position)
values
  ('ai-g1-c1', '21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 0),
  ('ai-g1-c2', '21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', 1),
  ('ai-g2-c1', '21000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000003', 0),
  ('ai-g2-c2', '21000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000004', 1),
  ('ai-g3-c1', '21000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000005', 0),
  ('ai-g3-c2', '21000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000006', 1);

insert into public.chain_entries (
  id, game_id, chain_id, player_id, round_number, entry_order, entry_type, text_content
)
values
  ('ai-g1-e1', '21000000-0000-0000-0000-000000000001', 'ai-g1-c1', '31000000-0000-0000-0000-000000000001', 0, 0, 'text', 'uno'),
  ('ai-g1-e2', '21000000-0000-0000-0000-000000000001', 'ai-g1-c1', '31000000-0000-0000-0000-000000000002', 1, 1, 'text', 'dos'),
  ('ai-g1-e3', '21000000-0000-0000-0000-000000000001', 'ai-g1-c2', '31000000-0000-0000-0000-000000000002', 0, 0, 'text', 'tres'),
  ('ai-g1-e4', '21000000-0000-0000-0000-000000000001', 'ai-g1-c2', '31000000-0000-0000-0000-000000000001', 1, 1, 'text', 'cuatro'),
  ('ai-g2-e1', '21000000-0000-0000-0000-000000000002', 'ai-g2-c1', '31000000-0000-0000-0000-000000000003', 0, 0, 'text', 'uno'),
  ('ai-g2-e2', '21000000-0000-0000-0000-000000000002', 'ai-g2-c1', '31000000-0000-0000-0000-000000000004', 1, 1, 'text', 'dos'),
  ('ai-g2-e3', '21000000-0000-0000-0000-000000000002', 'ai-g2-c2', '31000000-0000-0000-0000-000000000004', 0, 0, 'text', 'tres'),
  ('ai-g2-e4', '21000000-0000-0000-0000-000000000002', 'ai-g2-c2', '31000000-0000-0000-0000-000000000003', 1, 1, 'text', 'cuatro');

set local role service_role;
select lives_ok(
  $$select public.record_ai_commentary_attempt(
    '21000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    repeat('f', 64), 10, 20, 5
  )$$,
  'the service-role wrapper can execute its private helper'
);
reset role;
delete from private.ai_commentary_attempts;

select throws_ok(
  $$select public.record_ai_commentary_attempt(
    '21000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000002',
    repeat('a', 64), 10, 20, 5
  )$$,
  'P0001',
  'UNAUTHORIZED_COMMENTARY_GENERATION',
  'a non-host member cannot trigger generation under the existing host-only rule'
);
select throws_ok(
  $$select public.reserve_ai_commentary_generation(
    '21000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000001',
    1000
  )$$,
  'P0001',
  'INCOMPLETE_COMMENTARY_GAME',
  'an incomplete chain cannot be reserved'
);

select is(public.record_ai_commentary_attempt(
  '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', repeat('a', 64), 1, 20, 5
), 'allowed', 'the first user attempt is allowed');
select is(public.record_ai_commentary_attempt(
  '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', repeat('b', 64), 1, 20, 5
), 'rate_limited:user', 'the hourly user limit is enforced');

delete from private.ai_commentary_attempts;
select is(public.record_ai_commentary_attempt(
  '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', repeat('a', 64), 10, 1, 5
), 'allowed', 'the first IP attempt is allowed');
select is(public.record_ai_commentary_attempt(
  '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', repeat('a', 64), 10, 1, 5
), 'rate_limited:ip', 'the hourly IP limit is enforced');

delete from private.ai_commentary_attempts;
select is(public.record_ai_commentary_attempt(
  '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', repeat('a', 64), 10, 20, 1
), 'allowed', 'the first game attempt is allowed');
select is(public.record_ai_commentary_attempt(
  '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', repeat('b', 64), 10, 20, 1
), 'rate_limited:game', 'the total game limit is enforced');

delete from private.ai_commentary_attempts;
select is(public.record_ai_commentary_attempt(
  '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', repeat('a', 64), 1, 20, 5
), 'allowed', 'a rate-limit window records its first attempt');
update private.ai_commentary_attempts
set attempted_at = pg_catalog.now() - interval '2 hours';
select is(public.record_ai_commentary_attempt(
  '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', repeat('b', 64), 1, 20, 5
), 'allowed', 'the hourly limit resets after its window');

select is(
  public.reserve_ai_commentary_generation(
    '21000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001', 1
  )->>'status',
  'allowed',
  'below the daily cap generation is reserved'
);
select is(
  public.reserve_ai_commentary_generation(
    '21000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000001', 1
  )->>'status',
  'daily_cap',
  'a second reservation cannot exceed the global daily cap'
);
select is(
  public.reserve_ai_commentary_generation(
    '21000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001', 2
  )->>'status',
  'in_progress',
  'a concurrent request reuses the in-progress reservation'
);
select public.fail_ai_commentary_generation(
  '21000000-0000-0000-0000-000000000001',
  (select reservation_token from private.ai_commentary_generation_locks
    where game_id = '21000000-0000-0000-0000-000000000001')
);
select results_eq(
  $$select reserved_count from private.ai_daily_usage
    where usage_day = (pg_catalog.now() at time zone 'UTC')::date$$,
  array[0],
  'a failed OpenAI request releases its daily success reservation'
);

select is(
  public.reserve_ai_commentary_generation(
    '21000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001', 1
  )->>'status',
  'allowed',
  'a later valid retry can reserve generation'
);
select results_eq(
  $$select public.complete_ai_commentary(
      '21000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      (select reservation_token from private.ai_commentary_generation_locks
        where game_id = '21000000-0000-0000-0000-000000000001'),
      '["comentario protegido"]'::jsonb,
      'STANDARD'
    )->>'comments'$$,
  array['["comentario protegido"]'::text],
  'a reserved generation can persist its commentary'
);
select is(
  public.reserve_ai_commentary_generation(
    '21000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001', 1
  )->>'status',
  'reused',
  'a completed game always reuses its commentary'
);
select results_eq(
  $$select successful_count from private.ai_daily_usage
    where usage_day = (pg_catalog.now() at time zone 'UTC')::date$$,
  array[1],
  'successful billable generations are counted separately'
);

delete from public.game_commentaries;
delete from private.ai_commentary_generation_locks;
delete from private.ai_daily_usage;
insert into private.ai_daily_usage (usage_day, successful_count)
values (((pg_catalog.now() at time zone 'UTC')::date - 1), 1000);
select is(
  public.reserve_ai_commentary_generation(
    '21000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000001', 1
  )->>'status',
  'allowed',
  'the global cap resets on the next UTC calendar day'
);
select public.fail_ai_commentary_generation(
  '21000000-0000-0000-0000-000000000002',
  (select reservation_token from private.ai_commentary_generation_locks
    where game_id = '21000000-0000-0000-0000-000000000002')
);

select * from finish();
rollback;
