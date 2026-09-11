alter table public.games
  add column rematch_game_id uuid unique
  references public.games(id) on delete set null;

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
      'created_at', g.created_at,
      'rematch_code', (
        select rematch.code
        from public.games rematch
        where rematch.id = g.rematch_game_id
      )
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

create or replace function public.create_game_rematch(
  p_source_code text,
  p_auth_user_id uuid,
  p_new_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_game public.games%rowtype;
  source_host public.players%rowtype;
  existing_code text;
  new_game_id uuid := pg_catalog.gen_random_uuid();
  new_player_id uuid := pg_catalog.gen_random_uuid();
  normalized_new_code text := pg_catalog.upper(pg_catalog.btrim(p_new_code));
begin
  select * into source_game
  from public.games
  where code = pg_catalog.upper(pg_catalog.btrim(p_source_code))
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into source_host
  from public.players
  where game_id = source_game.id and id = source_game.host_player_id;

  if source_host.auth_user_id <> p_auth_user_id then
    raise exception 'NOT_HOST';
  end if;

  if source_game.phase not in ('REVEAL', 'FINISHED') then
    raise exception 'GAME_NOT_FINISHED';
  end if;

  if source_game.rematch_game_id is not null then
    select code into existing_code
    from public.games
    where id = source_game.rematch_game_id;
    return existing_code;
  end if;

  insert into public.games (id, code, host_player_id)
  values (new_game_id, normalized_new_code, new_player_id);

  insert into public.players (id, game_id, auth_user_id, name, join_order)
  values (
    new_player_id,
    new_game_id,
    p_auth_user_id,
    source_host.name,
    0
  );

  update public.games
  set rematch_game_id = new_game_id, version = version + 1
  where id = source_game.id;

  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'kind',
      'REMATCH_CREATED',
      'code',
      normalized_new_code,
      'version',
      source_game.version + 1
    ),
    'GAME_CHANGED',
    pg_catalog.concat('game:', source_game.id),
    true
  );

  return normalized_new_code;
end;
$$;

revoke execute on function public.create_game_rematch(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_game_rematch(text, uuid, text)
  to service_role;
