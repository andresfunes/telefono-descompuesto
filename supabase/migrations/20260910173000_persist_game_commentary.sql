create table public.game_commentaries (
  game_id uuid primary key references public.games(id) on delete cascade,
  comments jsonb not null,
  intensity text not null,
  generated_by_player_id uuid not null,
  generated_at timestamptz not null default now(),
  constraint game_commentaries_comments check (
    jsonb_typeof(comments) = 'array'
    and jsonb_array_length(comments) between 1 and 8
  ),
  constraint game_commentaries_intensity check (
    intensity in ('GENTLE', 'STANDARD', 'STRONG')
  ),
  foreign key (game_id, generated_by_player_id)
    references public.players (game_id, id) on delete restrict
);

alter table public.game_commentaries enable row level security;

grant select on public.game_commentaries to authenticated;

create policy "members can read revealed commentary"
  on public.game_commentaries for select to authenticated
  using (public.can_reveal_game(game_id));

create or replace function public.load_game_commentary(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'comments', commentary.comments,
    'intensity', commentary.intensity,
    'generated_at', commentary.generated_at
  )
  from public.game_commentaries commentary
  join public.games game on game.id = commentary.game_id
  where game.code = upper(trim(p_code));
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
    or jsonb_typeof(p_comments) <> 'array'
    or jsonb_array_length(p_comments) not between 1 and 8
    or exists (
      select 1
      from jsonb_array_elements(p_comments) item
      where jsonb_typeof(item) <> 'string' or length(trim(item #>> '{}')) = 0
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
    now()
  )
  on conflict (game_id) do update set
    comments = excluded.comments,
    intensity = excluded.intensity,
    generated_by_player_id = excluded.generated_by_player_id,
    generated_at = excluded.generated_at
  returning generated_at into saved_at;

  perform realtime.send(
    jsonb_build_object('kind', 'COMMENTARY_GENERATED'),
    'GAME_CHANGED',
    'game:' || p_game_id::text,
    true
  );

  return jsonb_build_object(
    'comments', p_comments,
    'intensity', p_intensity,
    'generated_at', saved_at
  );
end;
$$;

revoke all on function public.load_game_commentary(text)
  from public, anon, authenticated;
revoke all on function public.save_game_commentary(uuid, uuid, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.load_game_commentary(text) to service_role;
grant execute on function public.save_game_commentary(uuid, uuid, jsonb, text)
  to service_role;
