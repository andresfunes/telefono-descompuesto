# Copilot instructions for Teléfono Descompuesto

## Project overview

This is a mobile-first multiplayer party game built as a Next.js 16 App Router
monolith. Players use anonymous Supabase Auth sessions, join six-character rooms,
alternate text and drawing turns, and reveal the transformed chains. Audio and
emoji are represented in the domain model for future extensibility but are not
playable UI flows.

The main layers are:

- `app/`: routes, layouts, and Server Actions. Server Actions are the
  authoritative boundary for authentication, input validation, mutations,
  revalidation, redirects, Turnstile, AI protection, and admin analytics auth.
- `components/`: client-facing lobby, turn, reveal, invitation, realtime, and
  drawing UI. Drawing is local vector state rendered with `react-konva`, then
  exported to PNG only on submission.
- `domain/`: framework-independent game and commentary rules. Keep React,
  Supabase, and request concerns out of this layer.
- `repositories/`: stable interfaces and adapters. The in-memory game repository
  must remain usable for fast tests; Supabase adapters reconstruct the domain
  aggregate from PostgreSQL/Storage.
- `lib/`: Supabase clients, draft persistence, secure request helpers, AI
  commentary/protection, drawing URL resolution, and other application services.
- `supabase/`: migrations, local configuration, seed data, RLS/realtime rules,
  database functions, and pgTAP tests.
- `tests/`: Vitest unit and repository/security regression tests.

## Development commands

Use Node.js 22 and pnpm 11.19 (`nvm use` selects the project Node version).

```bash
pnpm install
pnpm dev                 # Next.js development server
pnpm lint                # ESLint
pnpm typecheck           # strict TypeScript check
pnpm test                # all Vitest tests
pnpm build               # production build
pnpm test:watch          # interactive Vitest watcher
pnpm supabase:start      # start local Supabase/Docker stack
pnpm supabase:reset      # recreate local DB from migrations and seed
pnpm supabase:test       # pgTAP database, RLS, and security tests
pnpm supabase:stop       # stop local Supabase
```

Run one Vitest file or test name directly:

```bash
pnpm exec vitest run tests/game-domain.test.ts
pnpm exec vitest run tests/game-domain.test.ts -t "advances"
```

For local end-to-end development, copy `.env.example` to `.env.local`, fill in
the Supabase values from `pnpm exec supabase status`, then run
`pnpm supabase:reset` and `pnpm dev`. Open `http://localhost:3000`. Do not
expose `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, Turnstile secrets, IP hash
secrets, or the admin analytics secret with `NEXT_PUBLIC_`.

Before a broad change, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`pnpm build`. Changes to migrations, RLS, realtime authorization, database
functions, or abuse protection also require `pnpm supabase:test`.

## Game and persistence invariants

- The server owns membership, assignments, submissions, round advancement, and
  phase transitions. A client must never decide that a round or game finished.
- A game moves through `LOBBY`, `PLAYING`, `REVEAL`, and `FINISHED`. A lobby
  requires at least two players, supports at most 12, expires after two hours,
  and can be locked by its host.
- For round `r`, player index `i` receives chain `(i - r) mod N`. There are `N`
  rounds, so each player contributes once to every chain. Preserve stable join
  order when changing assignment logic.
- `domain/game.ts` is the source of truth for validation and transitions. Use
  its rule functions and `GameRuleError` codes instead of duplicating rules in
  JSX or repositories.
- Chain entries must remain a discriminated union covering `text`, `drawing`,
  `audio`, and `emoji`, even though only text and drawing are currently
  playable. Drawing entries persisted in Supabase must reference private
  Storage paths, not client data URLs.
- `SupabaseGameRepository` loads and deserializes authoritative snapshots,
  applies domain transitions, and commits with an expected `games.version`.
  Handle compare-and-swap conflicts through the existing retry behavior; do not
  bypass the repository interface or make the client authoritative.
- Realtime `GAME_CHANGED` broadcasts only invalidate the view. The client must
  refresh/reload the authoritative snapshot after an event, not apply partial
  game state from the broadcast.
- Persist text and vector drawing drafts in browser storage so refreshes and
  retryable failures do not erase work. Every drawing element needs a globally
  unique stable ID; sanitize legacy drafts before using IDs as React/Konva keys.
- Resolve signed drawing URLs according to visibility: during play, only the
  assigned previous drawing is visible; all chain drawings become visible at
  reveal.

## Security and data boundaries

- Anonymous Supabase Auth identifies the player, but every Server Action must
  re-check the authenticated user and derive the player from the room/session.
  Never trust a client-supplied player identity or authorization flag.
- Normalize and validate room codes, names, round numbers, entry types, and
  content at the server boundary. Treat names, text, drawings, and model output
  as untrusted input.
- Preserve generic join errors for nonexistent, expired, locked, full, or
  already-started rooms. Keep cryptographic room-code generation, lobby limits,
  adaptive Turnstile, and HMAC-hashed IP rate limiting intact.
- Never expose service keys, raw IPs, hidden entries, private Storage paths, or
  full user-agent data. Maintain PostgreSQL RLS and private Realtime
  authorization when changing migrations or queries.
- AI commentary is host-only and protected by Turnstile and atomic per-user,
  per-IP, per-game, and global limits. Attribute entries using their
  authoritative author, semantic role, and received-entry relationship. Bind
  each image to its drawing entry and validate structured output against real
  chain/entry IDs; derive displayed award winners from validated entries, never
  model-written names.
- Funnel events belong outside the `Game` aggregate and must originate from
  authoritative database transitions. Keep them idempotent and free of room
  codes, auth user IDs, IPs, names, user content, and full user-agent strings.
  Client-submitted arbitrary analytics events are not supported.
- `/admin/analytics` must fail closed when its server-side Basic Auth secret is
  missing. Keep that secret in Server Components/server code only.

## Conventions and change boundaries

- Use strict TypeScript, two-space indentation, descriptive camelCase
  functions, PascalCase React components, and discriminated unions. Avoid
  `any`, unrelated refactors, and domain logic in JSX.
- Prefer focused components and existing helpers/interfaces. Keep the MVP as a
  single Next.js application; do not introduce services, queues, Redis, or new
  infrastructure without evidence in the existing design.
- Keep controls touch-friendly and layouts usable on iPhone Safari, Android
  Chrome, and desktop browsers in portrait and landscape.
- Do not stream pointer movement for drawing. Upload one PNG on submit and clean
  up a stored asset if the subsequent authoritative commit fails.
- Add pure regression tests for domain rules, drawing/draft utilities, and
  serialization/security behavior. Keep repository tests able to use the
  in-memory adapter.
- Migration and RLS changes belong in timestamped `supabase/migrations` files
  with corresponding pgTAP coverage in `supabase/tests/database`; do not create
  production Supabase resources manually in the dashboard.
- Follow existing Spanish user-facing error messages and privacy-preserving
  error handling. Use Conventional Commit-style messages such as
  `feat: add room invitations` or `fix: preserve drawing draft`.

Next.js-specific agent guidance is generated in `AGENTS.md`; consult the
matching guide under `node_modules/next/dist/docs/` before changing Next.js
APIs or conventions.
