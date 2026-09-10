create type public.game_phase as enum ('LOBBY', 'PLAYING', 'REVEAL', 'FINISHED');
create type public.entry_type as enum ('text', 'drawing', 'audio', 'emoji');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  phase public.game_phase not null default 'LOBBY',
  host_player_id uuid not null,
  current_round integer,
  current_entry_type public.entry_type,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint games_code_format check (
    code = upper(code) and code ~ '^[A-HJ-NP-Z2-9]{4}$'
  ),
  constraint games_round_state check (
    (phase = 'PLAYING' and current_round is not null and current_round >= 0
      and current_entry_type in ('text', 'drawing'))
    or
    (phase <> 'PLAYING' and current_round is null and current_entry_type is null)
  )
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  join_order integer not null,
  joined_at timestamptz not null default now(),
  constraint players_name_length check (char_length(name) between 2 and 24),
  constraint players_join_order check (join_order >= 0),
  unique (game_id, id),
  unique (game_id, auth_user_id),
  unique (game_id, join_order)
);

create unique index players_game_name_unique
  on public.players (game_id, lower(name));

alter table public.games
  add constraint games_host_belongs_to_game
  foreign key (id, host_player_id)
  references public.players (game_id, id)
  deferrable initially deferred;

create table public.chains (
  id text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  origin_player_id uuid not null,
  position integer not null,
  constraint chains_position check (position >= 0),
  unique (game_id, id),
  unique (game_id, origin_player_id),
  unique (game_id, position),
  foreign key (game_id, origin_player_id)
    references public.players (game_id, id) on delete restrict
);

create table public.chain_entries (
  id text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  chain_id text not null,
  player_id uuid not null,
  round_number integer not null,
  entry_order integer not null,
  entry_type public.entry_type not null,
  text_content text,
  drawing_path text,
  audio_path text,
  emoji_content text,
  created_at timestamptz not null default now(),
  constraint chain_entries_round check (round_number >= 0),
  constraint chain_entries_order check (entry_order >= 0),
  constraint chain_entries_content check (
    (entry_type = 'text' and text_content is not null
      and char_length(text_content) between 1 and 240
      and drawing_path is null and audio_path is null and emoji_content is null)
    or
    (entry_type = 'drawing' and drawing_path is not null
      and drawing_path !~ '^data:'
      and text_content is null and audio_path is null and emoji_content is null)
    or
    (entry_type = 'audio' and audio_path is not null
      and text_content is null and drawing_path is null and emoji_content is null)
    or
    (entry_type = 'emoji' and emoji_content is not null
      and text_content is null and drawing_path is null and audio_path is null)
  ),
  unique (game_id, id),
  unique (game_id, chain_id, round_number),
  unique (game_id, player_id, round_number),
  foreign key (game_id, chain_id)
    references public.chains (game_id, id) on delete cascade,
  foreign key (game_id, player_id)
    references public.players (game_id, id) on delete restrict
);

create index players_auth_user_idx on public.players (auth_user_id);
create index chains_game_idx on public.chains (game_id, position);
create index chain_entries_chain_idx
  on public.chain_entries (game_id, chain_id, entry_order);
create index chain_entries_round_idx
  on public.chain_entries (game_id, round_number);

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.chains enable row level security;
alter table public.chain_entries enable row level security;

create or replace function public.is_game_member(check_game_id uuid)
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

create or replace function public.can_reveal_game(check_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_game_member(check_game_id)
    and exists (
      select 1
      from public.games
      where id = check_game_id and phase in ('REVEAL', 'FINISHED')
    );
$$;

create or replace function public.can_access_game_topic(check_topic text)
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
      and check_topic = 'game:' || game_id::text
  );
$$;

revoke all on function public.is_game_member(uuid) from public, anon;
revoke all on function public.can_reveal_game(uuid) from public, anon;
revoke all on function public.can_access_game_topic(text) from public, anon;
grant execute on function public.is_game_member(uuid) to authenticated;
grant execute on function public.can_reveal_game(uuid) to authenticated;
grant execute on function public.can_access_game_topic(text) to authenticated;

grant select on public.games, public.players, public.chains, public.chain_entries
  to authenticated;

create policy "members can read their game"
  on public.games for select to authenticated
  using (public.is_game_member(id));

create policy "members can read players in their game"
  on public.players for select to authenticated
  using (public.is_game_member(game_id));

create policy "members can read chains after reveal"
  on public.chains for select to authenticated
  using (public.can_reveal_game(game_id));

create policy "members can read entries after reveal"
  on public.chain_entries for select to authenticated
  using (public.can_reveal_game(game_id));

create policy "members can receive private game broadcasts"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.can_access_game_topic((select realtime.topic()))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-drawings', 'game-drawings', false, 4194304, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "members can read revealed drawings"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'game-drawings'
    and exists (
      select 1
      from public.games
      where public.can_reveal_game(games.id)
        and storage.objects.name like 'games/' || games.id::text || '/%'
    )
  );

create or replace function public.load_game_snapshot(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'game', jsonb_build_object(
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
      select jsonb_agg(jsonb_build_object(
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
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'origin_player_id', c.origin_player_id,
        'position', c.position
      ) order by c.position)
      from public.chains c
      where c.game_id = g.id
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
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
  where g.code = upper(trim(p_code));
$$;

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
  new_game_id uuid := gen_random_uuid();
  new_player_id uuid := gen_random_uuid();
begin
  insert into public.games (id, code, host_player_id)
  values (new_game_id, upper(trim(p_code)), new_player_id);

  insert into public.players (id, game_id, auth_user_id, name, join_order)
  values (
    new_player_id,
    new_game_id,
    p_auth_user_id,
    regexp_replace(trim(p_player_name), '\\s+', ' ', 'g'),
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
  new_player_id uuid := gen_random_uuid();
  normalized_name text := regexp_replace(trim(p_player_name), '\\s+', ' ', 'g');
  next_join_order integer;
begin
  select * into target_game
  from public.games
  where code = upper(trim(p_code))
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
    where game_id = target_game.id and lower(name) = lower(normalized_name)
  ) then
    raise exception 'PLAYER_NAME_TAKEN';
  end if;

  select coalesce(max(join_order), -1) + 1 into next_join_order
  from public.players
  where game_id = target_game.id;

  insert into public.players (id, game_id, auth_user_id, name, join_order)
  values (new_player_id, target_game.id, p_auth_user_id, normalized_name, next_join_order);

  update public.games set version = version + 1 where id = target_game.id;

  perform realtime.send(
    jsonb_build_object('kind', 'PLAYER_JOINED', 'version', target_game.version + 1),
    'GAME_CHANGED',
    'game:' || target_game.id::text,
    true
  );

  return new_player_id;
end;
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
  from jsonb_to_recordset(p_chains) as item(
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
  from jsonb_to_recordset(p_entries) as item(
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
    jsonb_build_object('kind', p_event, 'version', next_version),
    'GAME_CHANGED',
    'game:' || p_game_id::text,
    true
  );

  return next_version;
end;
$$;

revoke all on function public.load_game_snapshot(text) from public, anon, authenticated;
revoke all on function public.create_game_with_host(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.join_game(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.commit_game_snapshot(
  uuid, bigint, public.game_phase, integer, public.entry_type, jsonb, jsonb, text
) from public, anon, authenticated;

grant execute on function public.load_game_snapshot(text) to service_role;
grant execute on function public.create_game_with_host(text, uuid, text) to service_role;
grant execute on function public.join_game(text, uuid, text) to service_role;
grant execute on function public.commit_game_snapshot(
  uuid, bigint, public.game_phase, integer, public.entry_type, jsonb, jsonb, text
) to service_role;
