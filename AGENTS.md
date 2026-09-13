# Repository Guidelines

## Product and Current Scope

TelefonoDescompuesto.com is a mobile-first multiplayer party game. Players join
without creating an account, alternate between text and drawings, and reveal the
resulting chains at the end.

The current product includes six-character room URLs, anonymous Supabase sessions,
private realtime updates, a Konva drawing editor, persisted drafts, QR/WhatsApp/link
invitations, host lobby controls, rematches, AI commentary and awards, adaptive
Turnstile protection, Vercel Web Analytics, and a private PostgreSQL product funnel.
Audio, emoji, registered accounts, voice/video, and collaborative live drawing are
not implemented in the UI.

## Stack and Project Structure

- `app/`: App Router pages, layouts, and authoritative Server Actions.
- `components/`: lobby, turns, reveal, invitations, realtime, and drawing UI.
- `domain/`: pure game and commentary rules; keep React out of this directory.
- `repositories/`: interfaces plus in-memory and Supabase implementations.
- `lib/`: Supabase clients, AI protection, admin analytics auth, drafts, and utilities.
- `supabase/`: migrations, local configuration, seed data, and pgTAP security tests.
- `tests/`: Vitest unit and repository tests.
- `public/`: static artwork and other public assets.

Core technologies are Next.js 16 App Router, React 19, strict TypeScript, Tailwind
CSS, Supabase PostgreSQL/Realtime/Storage, `react-konva`, OpenAI Responses API,
Cloudflare Turnstile, and Vercel Analytics. Keep the MVP as a Next.js monolith; do
not introduce separate services, Redis, queues, or infrastructure without evidence.

## Game and Persistence Architecture

The server owns game state, membership, assignments, submissions, round advancement,
and reveal transitions. Clients may never decide that a round or game has finished.
For round `r`, player `i` receives chain `(i - r) mod N`; every player therefore
contributes once to every chain across `N` rounds.

Draw locally and upload only the submitted PNG. Never stream pointer movement.
Persist text and vector drawing drafts in browser storage so refreshes and retryable
errors do not erase work. Realtime broadcasts only invalidate the view; reload the
authoritative snapshot after each event. Preserve the repository interface and keep
the in-memory adapter usable in tests.

Chain entries must remain extensible across `text`, `drawing`, `audio`, and `emoji`,
even though only text and drawing are playable today.

## UX and Security Rules

Prioritize iPhone Safari, Android Chrome, and desktop Chrome/Safari. Joining requires
only `/ABC234` plus a player name. Keep controls touch-friendly and layouts responsive
in both portrait and landscape.

Never expose service keys, raw client IPs, hidden entries, or private drawing paths.
Maintain RLS and private realtime authorization. Room codes use cryptographic
randomness; lobbies expire, cap membership at 12, and can be locked by the host.
Keep generic join errors, adaptive Turnstile checks, hashed-IP rate limits, and
host-only AI generation. Treat player names, text, and drawings as untrusted input.

Core funnel events must originate from authoritative database transitions, remain
outside the `Game` aggregate, and be idempotent. Never accept arbitrary analytics
events or metadata from clients. Keep `private.product_events` free of room codes,
auth user IDs, IPs, names, user-generated content, and full User-Agent strings. The
internal `/admin/analytics` route must fail closed and keep its Basic Auth secret on
the server. Vercel Analytics remains responsible for aggregate traffic/page views.

## Coding, Testing, and Commits

Use focused components, two-space indentation, descriptive camelCase functions, and
PascalCase React components. Avoid `any`, unrelated refactors, and domain logic in
JSX. Follow existing ESLint and TypeScript settings.

Run before completion:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm supabase:test` for migrations, RLS, realtime, abuse protection, or database
functions. Add pure tests for game rules and regression tests for drawing/utilities.
Use Conventional Commit-style messages such as `feat: add room invitations` or
`fix: preserve drawing draft`. Pull requests should explain behavior changes,
validation performed, migrations/environment changes, and include screenshots for UI.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
