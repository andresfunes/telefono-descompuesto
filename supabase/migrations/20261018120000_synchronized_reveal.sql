-- Legacy games retain their complete summary. New reveals start behind a curtain.
alter table public.games add column reveal_step integer check (reveal_step >= -1);

create function private.initialize_reveal_step()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.phase = 'PLAYING' and new.phase = 'REVEAL' then
    new.reveal_step := -1;
  end if;
  return new;
end;
$$;
revoke all on function private.initialize_reveal_step() from public, anon, authenticated, service_role;
create trigger initialize_reveal_step before update of phase on public.games
for each row execute function private.initialize_reveal_step();

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
      'reveal_step', g.reveal_step,
      'created_at', g.created_at,
      'rematch_code', (
        select rematch.code from public.games rematch where rematch.id = g.rematch_game_id
      ),
      'lobby_locked', g.lobby_locked,
      'lobby_expires_at', g.lobby_expires_at
    ),
    'players', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', p.id,
        'auth_user_id', p.auth_user_id,
        'name', p.name,
        'join_order', p.join_order,
        'joined_at', p.joined_at,
        'is_active', p.is_active
      ) order by p.join_order)
      from public.players p where p.game_id = g.id
    ), '[]'::jsonb),
    'chains', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id,
        'origin_player_id', c.origin_player_id,
        'position', c.position
      ) order by c.position)
      from public.chains c where c.game_id = g.id
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
      from public.chain_entries e where e.game_id = g.id
    ), '[]'::jsonb)
  )
  from public.games g
  where g.code = pg_catalog.upper(pg_catalog.btrim(p_code));
$$;


-- Only the server can call this; identity comes from its authenticated session.
create function public.set_game_reveal_step(
  p_code text, p_auth_user_id uuid, p_expected_step integer, p_step integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  target public.games%rowtype;
  entry_count integer;
begin
  select * into target from public.games
    where code = pg_catalog.upper(pg_catalog.btrim(p_code)) for update;
  if not found then return false; end if;
  if not exists (select 1 from public.players where id = target.host_player_id
    and game_id = target.id and auth_user_id = p_auth_user_id and is_active) then
    raise exception 'NOT_HOST';
  end if;
  if target.phase not in ('REVEAL', 'FINISHED') then raise exception 'NOT_REVEAL'; end if;
  select count(*) into entry_count from public.chain_entries where game_id = target.id;
  if p_step is null or p_step < -1 or p_step > entry_count then raise exception 'INVALID_STEP'; end if;
  if target.reveal_step is distinct from p_expected_step then return false; end if;
  if target.reveal_step is not distinct from p_step then return true; end if;
  update public.games set reveal_step = p_step, version = version + 1 where id = target.id;
  perform realtime.send(
    pg_catalog.jsonb_build_object('kind', 'REVEAL_STEP_CHANGED', 'version', target.version + 1),
    'GAME_CHANGED', pg_catalog.concat('game:', target.id), true
  );
  return true;
end;
$$;
revoke all on function public.set_game_reveal_step(text, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.set_game_reveal_step(text, uuid, integer, integer) to service_role;

-- Direct browser reads cannot bypass the presentation to see future cards or awards.
-- Visible cards are rendered on the server; drawings use individually signed URLs.
create or replace function private.can_reveal_game(check_game_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_game_member(check_game_id) and exists (
    select 1 from public.games g where g.id = check_game_id
      and g.phase in ('REVEAL', 'FINISHED')
      and (g.reveal_step is null or g.reveal_step >= (
        select count(*) from public.chain_entries e where e.game_id = g.id
      ))
  );
$$;
