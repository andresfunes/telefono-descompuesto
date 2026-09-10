create schema if not exists private;

revoke all on schema private from public, anon, service_role;
grant usage on schema private to authenticated;

alter function public.is_game_member(uuid) set schema private;
alter function public.can_reveal_game(uuid) set schema private;
alter function public.can_access_game_topic(text) set schema private;

create or replace function private.is_game_member(check_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where game_id = check_game_id
      and auth_user_id = (select auth.uid())
  );
$$;

create or replace function private.can_reveal_game(check_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_game_member(check_game_id)
    and exists (
      select 1
      from public.games
      where id = check_game_id and phase in ('REVEAL', 'FINISHED')
    );
$$;

create or replace function private.can_access_game_topic(check_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where auth_user_id = (select auth.uid())
      and check_topic = pg_catalog.concat('game:', game_id)
  );
$$;

revoke execute on function private.is_game_member(uuid)
  from public, anon, service_role;
revoke execute on function private.can_reveal_game(uuid)
  from public, anon, service_role;
revoke execute on function private.can_access_game_topic(text)
  from public, anon, service_role;

grant execute on function private.is_game_member(uuid) to authenticated;
grant execute on function private.can_reveal_game(uuid) to authenticated;
grant execute on function private.can_access_game_topic(text) to authenticated;

drop policy "members can read their game" on public.games;
create policy "members can read their game"
  on public.games for select to authenticated
  using (private.is_game_member(id));

drop policy "members can read players in their game" on public.players;
create policy "members can read players in their game"
  on public.players for select to authenticated
  using (private.is_game_member(game_id));

drop policy "members can read chains after reveal" on public.chains;
create policy "members can read chains after reveal"
  on public.chains for select to authenticated
  using (private.can_reveal_game(game_id));

drop policy "members can read entries after reveal" on public.chain_entries;
create policy "members can read entries after reveal"
  on public.chain_entries for select to authenticated
  using (private.can_reveal_game(game_id));

drop policy "members can read revealed commentary" on public.game_commentaries;
create policy "members can read revealed commentary"
  on public.game_commentaries for select to authenticated
  using (private.can_reveal_game(game_id));

drop policy "members can receive private game broadcasts" on realtime.messages;
create policy "members can receive private game broadcasts"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.can_access_game_topic((select realtime.topic()))
  );

drop policy "members can read revealed drawings" on storage.objects;
create policy "members can read revealed drawings"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'game-drawings'
    and exists (
      select 1
      from public.games
      where private.can_reveal_game(public.games.id)
        and storage.objects.name like pg_catalog.concat(
          'games/',
          public.games.id,
          '/%'
        )
    )
  );

create or replace function public.create_game_with_host(
  p_code text,
  p_auth_user_id uuid,
  p_player_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_game_id uuid := pg_catalog.gen_random_uuid();
  new_player_id uuid := pg_catalog.gen_random_uuid();
begin
  insert into public.games (id, code, host_player_id)
  values (
    new_game_id,
    pg_catalog.upper(pg_catalog.btrim(p_code)),
    new_player_id
  );

  insert into public.players (id, game_id, auth_user_id, name, join_order)
  values (
    new_player_id,
    new_game_id,
    p_auth_user_id,
    pg_catalog.regexp_replace(pg_catalog.btrim(p_player_name), '\\s+', ' ', 'g'),
    0
  );

  return new_game_id;
end;
$$;

create or replace function public.join_game(
  p_code text,
  p_auth_user_id uuid,
  p_player_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games%rowtype;
  existing_player_id uuid;
  new_player_id uuid := pg_catalog.gen_random_uuid();
  normalized_name text := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_player_name),
    '\\s+',
    ' ',
    'g'
  );
  next_join_order integer;
begin
  select * into target_game
  from public.games
  where code = pg_catalog.upper(pg_catalog.btrim(p_code))
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select id into existing_player_id
  from public.players
  where game_id = target_game.id and auth_user_id = p_auth_user_id;

  if existing_player_id is not null then
    return existing_player_id;
  end if;

  if target_game.phase <> 'LOBBY' then
    raise exception 'GAME_ALREADY_STARTED';
  end if;

  if exists (
    select 1 from public.players
    where game_id = target_game.id
      and pg_catalog.lower(name) = pg_catalog.lower(normalized_name)
  ) then
    raise exception 'PLAYER_NAME_TAKEN';
  end if;

  select coalesce(pg_catalog.max(join_order), -1) + 1
  into next_join_order
  from public.players
  where game_id = target_game.id;

  insert into public.players (id, game_id, auth_user_id, name, join_order)
  values (new_player_id, target_game.id, p_auth_user_id, normalized_name, next_join_order);

  update public.games set version = version + 1 where id = target_game.id;

  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'kind',
      'PLAYER_JOINED',
      'version',
      target_game.version + 1
    ),
    'GAME_CHANGED',
    pg_catalog.concat('game:', target_game.id),
    true
  );

  return new_player_id;
end;
$$;

create or replace function public.load_game_snapshot(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'game', pg_catalog.jsonb_build_object(
      'id', g.id,
      'code', g.code,
      'phase', g.phase,
      'host_player_id', g.host_player_id,
      'current_round', g.current_round,
      'current_entry_type', g.current_entry_type,
      'version', g.version,
      'created_at', g.created_at
    ),
    'players', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', p.id,
        'auth_user_id', p.auth_user_id,
        'name', p.name,
        'join_order', p.join_order,
        'joined_at', p.joined_at
      ) order by p.join_order)
      from public.players p
      where p.game_id = g.id
    ), '[]'::jsonb),
    'chains', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id,
        'origin_player_id', c.origin_player_id,
        'position', c.position
      ) order by c.position)
      from public.chains c
      where c.game_id = g.id
    ), '[]'::jsonb),
    'entries', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id,
        'chain_id', e.chain_id,
        'player_id', e.player_id,
        'round_number', e.round_number,
        'entry_order', e.entry_order,
        'entry_type', e.entry_type,
        'text_content', e.text_content,
        'drawing_path', e.drawing_path,
        'audio_path', e.audio_path,
        'emoji_content', e.emoji_content,
        'created_at', e.created_at
      ) order by e.chain_id, e.entry_order)
      from public.chain_entries e
      where e.game_id = g.id
    ), '[]'::jsonb)
  )
  from public.games g
  where g.code = pg_catalog.upper(pg_catalog.btrim(p_code));
$$;

create or replace function public.commit_game_snapshot(
  p_game_id uuid,
  p_expected_version bigint,
  p_phase public.game_phase,
  p_current_round integer,
  p_current_entry_type public.entry_type,
  p_chains jsonb,
  p_entries jsonb,
  p_event text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_version bigint;
  next_version bigint;
begin
  select version into current_version
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if current_version <> p_expected_version then
    return null;
  end if;

  insert into public.chains (id, game_id, origin_player_id, position)
  select item.id, p_game_id, item.origin_player_id, item.position
  from pg_catalog.jsonb_to_recordset(p_chains) as item(
    id text,
    origin_player_id uuid,
    position integer
  )
  on conflict (id) do nothing;

  insert into public.chain_entries (
    id,
    game_id,
    chain_id,
    player_id,
    round_number,
    entry_order,
    entry_type,
    text_content,
    drawing_path,
    audio_path,
    emoji_content,
    created_at
  )
  select
    item.id,
    p_game_id,
    item.chain_id,
    item.player_id,
    item.round_number,
    item.entry_order,
    item.entry_type,
    item.text_content,
    item.drawing_path,
    item.audio_path,
    item.emoji_content,
    item.created_at
  from pg_catalog.jsonb_to_recordset(p_entries) as item(
    id text,
    chain_id text,
    player_id uuid,
    round_number integer,
    entry_order integer,
    entry_type public.entry_type,
    text_content text,
    drawing_path text,
    audio_path text,
    emoji_content text,
    created_at timestamptz
  )
  on conflict (id) do nothing;

  next_version := current_version + 1;
  update public.games set
    phase = p_phase,
    current_round = p_current_round,
    current_entry_type = p_current_entry_type,
    version = next_version
  where id = p_game_id;

  perform realtime.send(
    pg_catalog.jsonb_build_object('kind', p_event, 'version', next_version),
    'GAME_CHANGED',
    pg_catalog.concat('game:', p_game_id),
    true
  );

  return next_version;
end;
$$;

create or replace function public.load_game_commentary(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'comments', commentary.comments,
    'intensity', commentary.intensity,
    'generated_at', commentary.generated_at
  )
  from public.game_commentaries commentary
  join public.games game on game.id = commentary.game_id
  where game.code = pg_catalog.upper(pg_catalog.btrim(p_code));
$$;

create or replace function public.save_game_commentary(
  p_game_id uuid,
  p_auth_user_id uuid,
  p_comments jsonb,
  p_intensity text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games%rowtype;
  saved_at timestamptz;
begin
  select game.* into target_game
  from public.games game
  join public.players host
    on host.game_id = game.id and host.id = game.host_player_id
  where game.id = p_game_id and host.auth_user_id = p_auth_user_id
  for update of game;

  if not found then
    raise exception 'UNAUTHORIZED_COMMENTARY_GENERATION';
  end if;

  if target_game.phase not in ('REVEAL', 'FINISHED') then
    raise exception 'COMMENTARY_NOT_AVAILABLE';
  end if;

  if p_comments is null
    or pg_catalog.jsonb_typeof(p_comments) <> 'array'
    or pg_catalog.jsonb_array_length(p_comments) not between 1 and 8
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_comments) item
      where pg_catalog.jsonb_typeof(item) <> 'string'
        or pg_catalog.length(pg_catalog.btrim(item #>> '{}')) = 0
    )
  then
    raise exception 'INVALID_COMMENTARY';
  end if;

  if p_intensity is null or p_intensity not in ('GENTLE', 'STANDARD', 'STRONG') then
    raise exception 'INVALID_COMMENTARY_INTENSITY';
  end if;

  insert into public.game_commentaries (
    game_id,
    comments,
    intensity,
    generated_by_player_id,
    generated_at
  ) values (
    p_game_id,
    p_comments,
    p_intensity,
    target_game.host_player_id,
    pg_catalog.now()
  )
  on conflict (game_id) do update set
    comments = excluded.comments,
    intensity = excluded.intensity,
    generated_by_player_id = excluded.generated_by_player_id,
    generated_at = excluded.generated_at
  returning generated_at into saved_at;

  perform realtime.send(
    pg_catalog.jsonb_build_object('kind', 'COMMENTARY_GENERATED'),
    'GAME_CHANGED',
    pg_catalog.concat('game:', p_game_id),
    true
  );

  return pg_catalog.jsonb_build_object(
    'comments', p_comments,
    'intensity', p_intensity,
    'generated_at', saved_at
  );
end;
$$;

revoke execute on function public.create_game_with_host(text, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.join_game(text, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.load_game_snapshot(text)
  from public, anon, authenticated;
revoke execute on function public.commit_game_snapshot(
  uuid, bigint, public.game_phase, integer, public.entry_type, jsonb, jsonb, text
) from public, anon, authenticated;
revoke execute on function public.load_game_commentary(text)
  from public, anon, authenticated;
revoke execute on function public.save_game_commentary(uuid, uuid, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.create_game_with_host(text, uuid, text) to service_role;
grant execute on function public.join_game(text, uuid, text) to service_role;
grant execute on function public.load_game_snapshot(text) to service_role;
grant execute on function public.commit_game_snapshot(
  uuid, bigint, public.game_phase, integer, public.entry_type, jsonb, jsonb, text
) to service_role;
grant execute on function public.load_game_commentary(text) to service_role;
grant execute on function public.save_game_commentary(uuid, uuid, jsonb, text)
  to service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;
