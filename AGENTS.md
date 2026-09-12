# AGENTS.md

## Project

TelefonoDescompuesto.com is a mobile-first multiplayer party game
inspired by the traditional "teléfono descompuesto" game.

The initial product should prioritize:
- extremely low friction to join a game
- no user registration for MVP
- mobile-first UX
- realtime multiplayer
- fast iteration
- simple architecture
- shareable game results

## Tech Stack

- Next.js
- React
- TypeScript
- App Router
- Tailwind CSS
- Zustand
- Supabase PostgreSQL
- Supabase Realtime
- Supabase Storage
- react-konva for drawing

Future integrations:
- LiveKit for voice/video
- OpenAI API for AI narration and game recap

## Architecture principles

Prefer simplicity over abstraction.

Do not introduce:
- microservices
- Kafka
- Kubernetes
- Redis
- separate backend services

unless there is a demonstrated need.

Keep the application as a Next.js monolith during the MVP.

## Game architecture

The server is authoritative for:
- game state
- rounds
- assignments
- timers
- transitions

Clients must never decide globally that a round or game has ended.

Drawing happens locally in the browser.

Do not stream drawing pointer movements in realtime.

Persist the completed drawing when the player submits it.

## Game model

Design chain entries so new content types can be introduced later.

Expected entry types:

- text
- drawing
- audio
- emoji

Do not couple the game engine exclusively to text/drawing.

## UX

Mobile-first.

Joining a room should require only:

1. room code / invitation URL
2. player name

No account creation for MVP.

Room URLs should be short:

/ABC234

Prioritize:
- iPhone Safari
- Android Chrome
- desktop Chrome/Safari

## Code quality

- TypeScript strict mode
- avoid `any`
- small focused components
- game logic should not live inside React components
- separate game domain logic from UI
- prefer pure functions for game rules
- add tests for game assignment and round-transition logic

## Commands

Before considering a task complete:

- run lint
- run typecheck
- run tests relevant to the change

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
