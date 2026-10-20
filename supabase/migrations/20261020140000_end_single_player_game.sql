create or replace function public.remove_game_player(
  p_code text,
  p_auth_user_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games%rowtype;
  removed_auth_user_id uuid;
  active_pending_count integer;
  next_round integer;
  event_kind text := 'PLAYER_REMOVED';
begin
  select game.* into target_game
  from public.games game
  join public.players host
    on host.game_id = game.id and host.id = game.host_player_id and host.is_active
  where game.code = pg_catalog.upper(pg_catalog.btrim(p_code))
    and host.auth_user_id = p_auth_user_id
  for update of game;

  if not found then raise exception 'NOT_HOST'; end if;
  if target_game.phase not in ('LOBBY', 'PLAYING') then
    raise exception 'GAME_ALREADY_STARTED';
  end if;
  if target_game.phase = 'LOBBY'
    and target_game.lobby_expires_at <= pg_catalog.now()
  then
    raise exception 'LOBBY_EXPIRED';
  end if;
  if p_player_id = target_game.host_player_id then raise exception 'CANNOT_REMOVE_HOST'; end if;

  select player.auth_user_id into removed_auth_user_id
  from public.players player
  where player.game_id = target_game.id
    and player.id = p_player_id
    and player.is_active
  for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if target_game.phase = 'LOBBY' then
    delete from public.players player
    where player.game_id = target_game.id and player.id = p_player_id;

    insert into private.game_removed_users (game_id, auth_user_id)
    values (target_game.id, removed_auth_user_id)
    on conflict (game_id, auth_user_id) do nothing;
  else
    if exists (
      select 1
      from public.chain_entries entry
      where entry.game_id = target_game.id
        and entry.player_id = p_player_id
        and entry.round_number = target_game.current_round
    ) then
      raise exception 'PLAYER_ALREADY_SUBMITTED';
    end if;

    update public.players
    set is_active = false
    where game_id = target_game.id and id = p_player_id;

    select pg_catalog.count(*)::integer into active_pending_count
    from public.players player
    where player.game_id = target_game.id
      and player.is_active
      and not exists (
        select 1
        from public.chain_entries entry
        where entry.game_id = target_game.id
          and entry.player_id = player.id
          and entry.round_number = target_game.current_round
      );

    if (select count(*) from public.players
        where game_id = target_game.id and is_active) < 2 then
      update public.games
      set phase = 'REVEAL', current_round = null, current_entry_type = null,
          version = version + 1
      where id = target_game.id;
      event_kind := 'REVEAL_STARTED';
    elsif active_pending_count = 0 then
      next_round := target_game.current_round + 1;
      if next_round >= least(coalesce(target_game.round_limit, 12), (
        select pg_catalog.count(*)::integer
        from public.players player
        where player.game_id = target_game.id
      )) then
        update public.games
        set phase = 'REVEAL',
            current_round = null,
            current_entry_type = null,
            version = version + 1
        where id = target_game.id;
        event_kind := 'REVEAL_STARTED';
      else
        update public.games
        set current_round = next_round,
            current_entry_type = case
              when next_round % 2 = 0 then 'text'::public.entry_type
              else 'drawing'::public.entry_type
            end,
            version = version + 1
        where id = target_game.id;
        event_kind := 'ROUND_ADVANCED';
      end if;
    else
      update public.games
      set version = version + 1
      where id = target_game.id;
    end if;
  end if;

  if target_game.phase = 'LOBBY' then
    update public.games
    set version = version + 1
    where id = target_game.id;
  end if;

  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'kind', event_kind, 'version', target_game.version + 1
    ),
    'GAME_CHANGED',
    pg_catalog.concat('game:', target_game.id),
    true
  );
end;
$$;

-- A game can end before any entries are submitted after its last opponent is removed.
alter table private.product_events
  drop constraint product_events_round_count_check;
alter table private.product_events
  add constraint product_events_round_count_check check (round_count between 0 and 12);
