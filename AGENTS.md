# AGENTS.md

Operating guide for AI coding agents (and humans) working in this repository.

## What this project is

**The AI Leadership Challenge** — a booth engagement experience built by Outskill for the
**People Matters TechHR Summit 2026** (Delhi, India, 6–7 August 2026, `Asia/Kolkata`).

Senior HR and business leaders answer **7 workplace AI decisions in 130 seconds**. Scores feed a live
public leaderboard shown on an LED screen. The top-ranked verified entry after Day 2 wins an iPad.

It is a **premium executive experience**, not a school quiz. Tone, copy and visual design must reflect that.

## Non-negotiable product rules

1. The quiz measures **individual AI leadership judgment**. It never claims to diagnose an organisation's
   AI readiness, and its output is never described as a "diagnostic report".
2. Participants only ever see: correct answers out of 7, completion time, leaderboard position, and a
   top-5 verification message. No PDF, no email, no WhatsApp, no per-question feedback.
3. **No runtime AI / LLM calls.** Questions are a curated static bank managed through the admin UI.
4. Only name, email and phone are collected. Never company, title, designation, address or password.

## Non-negotiable engineering rules

1. **Correct answers never reach the browser.** `correct_option_id` and `explanation` are stripped in the
   server layer (`toParticipantQuestion` in `src/lib/quiz/selection.ts`). Any new endpoint returning
   questions must go through that mapper.
2. **The server is authoritative** for start time, deadline, elapsed time, score and rank. Client-supplied
   scores, timings and ranks are ignored, never merely "validated".
3. **No database secret in the browser.** `SUPABASE_SECRET_KEY` is read only inside `src/lib/database/`.
   No environment variable holding a secret may be prefixed `NEXT_PUBLIC_`.
4. **All DB access goes through repositories** (`src/lib/repositories/`) which sit behind the
   `DataStore` interface in `src/lib/database/store.ts`. React components never touch Supabase.
5. **Business logic lives in `src/lib/`**, not in components. Components render and collect input.
6. **Never log PII** — no names, emails, phone numbers, answers, or raw IP addresses. Use
   `src/lib/utils/logger.ts`, which is the only sanctioned logging path.
7. **IP addresses are hashed** with `IP_HASH_SECRET` before storage (`src/lib/security/hash.ts`).
8. **The build must succeed without secrets.** Never read production env vars at module top level in
   code reachable from a page/layout render or `next build`. Use the lazy accessors in
   `src/lib/config/env.ts`.
9. **Cache singletons on `globalThis`, not in module scope.** Next bundles server components and
   route handlers separately, so a module-level `let` gives you one copy *per bundle*. That silently
   split the demo store's data in a production build until it was fixed. See
   `src/lib/database/index.ts` and `demo-store.ts`.
10. **Scheme-dependent behaviour comes from `servesOverHttps()`**, not from `NODE_ENV`. A `Secure`
    cookie and `upgrade-insecure-requests` both break an http origin outright, and a production build
    served over http on a venue LAN is a real scenario. See `src/lib/config/scheme.ts`.

## Layout

```
src/app/                  routes (App Router). api/public/* and api/admin/* are Route Handlers.
src/components/           participant/ leaderboard/ display/ admin/ ui/
src/lib/config/           constants.ts (all magic numbers) and env.ts (lazy, validated env access)
src/lib/database/         supabase client, DataStore interface, Supabase + demo implementations
src/lib/repositories/     typed data operations used by route handlers
src/lib/quiz/             seed bank, selection blueprint, scoring, ranking
src/lib/auth/             admin session cookies, rate limiting
src/lib/security/         signed tokens, hashing, origin checks
src/lib/validation/       zod schemas, one per endpoint
src/lib/utils/            phone, email, public-name masking, csv, logger, time
src/types/                shared domain types
supabase/migrations/      ordered SQL migrations (numeric prefix)
supabase/seed.sql         generated — do not hand-edit; run `npm run seed:sql`
tests/unit/               vitest
tests/e2e/                playwright
scripts/                  seed, seed-sql generation, smoke load
docs/                     setup guide, runbook, implementation plan, manual test checklist
```

## Conventions

- TypeScript strict. `any` is disallowed; use `unknown` plus narrowing. If truly unavoidable, add a
  one-line comment explaining why.
- No magic numbers. Durations, counts and limits live in `src/lib/config/constants.ts` or in
  `app_settings`.
- Zod validates every request body and query string at the route boundary.
- Route handlers return `{ ok: true, data }` or `{ ok: false, error: { code, message, requestId } }`.
  Public errors are friendly and never include database detail.
- Tailwind v4 with CSS-first theming. Colour and radius tokens live in `src/app/globals.css` under
  `@theme`. Do not hard-code hex values in components.
- `supabase/seed.sql` is generated from `src/lib/quiz/seed-questions.ts`. Edit the TypeScript, then
  run `npm run seed:sql`.

## Before you commit

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

All four must pass. Do not disable a lint rule or skip a test to make the suite green — fix the cause.
The one standing exception is `@next/next/no-html-link-for-pages` on the CSV download links: those
point at Route Handlers streaming an attachment, and `next/link` would client-navigate and break the
download. Each of those suppressions carries that reason inline.

Browser tests run on Chromium *and* WebKit (`npm run test:e2e`). WebKit matters: the booth tablets are
iPads, and two real defects — the CSP upgrade directive and the cookie `Secure` flag — only showed up
there.

## Demo mode

`DEMO_MODE=1` (never set in production) swaps the Supabase store for an in-memory store seeded with
obviously fake data, so the UI can be reviewed before Supabase exists. A "DEMO MODE" badge is always
visible when it is on. Production route handlers must fail loudly — never silently fall back to the
demo store — when Supabase configuration is missing.

## Logo

`public/outskill-logo.svg` is a placeholder text wordmark. If an official Outskill asset exists, drop it
in at that exact path. Do not redraw or invent the official logo.
