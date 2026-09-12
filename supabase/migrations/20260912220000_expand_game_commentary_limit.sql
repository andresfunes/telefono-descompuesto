create or replace function private.complete_ai_commentary(
  p_game_id uuid,
  p_auth_user_id uuid,
  p_reservation_token uuid,
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
  generation private.ai_commentary_generation_locks%rowtype;
  saved_at timestamptz;
begin
  select commentary.generated_at into saved_at
  from public.game_commentaries commentary
  where commentary.game_id = p_game_id;

  if found then
    return (
      select pg_catalog.jsonb_build_object(
        'comments', commentary.comments,
        'intensity', commentary.intensity,
        'generated_at', commentary.generated_at
      )
      from public.game_commentaries commentary
      where commentary.game_id = p_game_id
    );
  end if;

  select game.* into target_game
  from public.games game
  join public.players host
    on host.game_id = game.id and host.id = game.host_player_id
  where game.id = p_game_id
    and game.phase = 'REVEAL'
    and host.auth_user_id = p_auth_user_id
  for update of game;

  select lock.* into generation
  from private.ai_commentary_generation_locks lock
  where lock.game_id = p_game_id
    and lock.status = 'PROCESSING'
    and lock.reservation_token = p_reservation_token
  for update;

  if target_game.id is null or generation.game_id is null then
    raise exception 'INVALID_COMMENTARY_RESERVATION';
  end if;

  if p_comments is null
    or pg_catalog.jsonb_typeof(p_comments) <> 'array'
    or pg_catalog.jsonb_array_length(p_comments) not between 1 and 20
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
  on conflict (game_id) do nothing
  returning generated_at into saved_at;

  update private.ai_daily_usage
  set reserved_count = case when reserved_count > 0 then reserved_count - 1 else 0 end,
      successful_count = successful_count + 1,
      updated_at = pg_catalog.now()
  where usage_day = generation.usage_day;

  update private.ai_commentary_generation_locks
  set status = 'COMPLETED', completed_at = pg_catalog.now()
  where game_id = p_game_id and reservation_token = p_reservation_token;

  perform realtime.send(
    pg_catalog.jsonb_build_object('kind', 'COMMENTARY_GENERATED'),
    'GAME_CHANGED',
    pg_catalog.concat('game:', p_game_id::text),
    true
  );

  return pg_catalog.jsonb_build_object(
    'comments', p_comments,
    'intensity', p_intensity,
    'generated_at', saved_at
  );
end;
$$;

revoke all on function private.complete_ai_commentary(
  uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function private.complete_ai_commentary(
  uuid, uuid, uuid, jsonb, text
) to service_role;
