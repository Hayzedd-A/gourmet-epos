# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start the dev server (localhost:7282)
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint (flat config via `eslint-config-next`)

There is no test runner configured in this project yet.

## Project state

This is becoming an offline-first Electron + Next.js POS app for Gourmet Twist (a restaurant brand). **Read `docs/ARCHITECTURE.md` before making any structural change** — it records the system design decisions (Electron shell, local SQLite as source of truth, outbox sync pattern against `zupa-api`, auth, hardware) and why they were made. Treat it as living documentation: update it when a decision changes, don't let the code silently diverge from it.

The scaffold itself is still close to a stock `create-next-app` (Next.js 16.2.10, React 19.2.4, App Router, TypeScript, Tailwind CSS v4) — the Electron main process, local DB, and sync engine described in the architecture doc have not been built yet.

Per AGENTS.md: this Next.js version has behavior that diverges from your training data. Before implementing routing, data fetching, or config changes, check `node_modules/next/dist/docs/` (mirrors nextjs.org/docs, split into `01-app`, `02-pages`, `03-architecture`, `04-community`) rather than relying on prior Next.js knowledge.

## Conventions

- Path alias `@/*` maps to the repo root (`tsconfig.json`).
- Styling is Tailwind CSS v4 via `@tailwindcss/postcss` (no `tailwind.config.*` — v4 config lives in `app/globals.css`).
