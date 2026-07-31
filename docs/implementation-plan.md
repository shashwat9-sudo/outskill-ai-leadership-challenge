# Implementation plan

Project: **The AI Leadership Challenge** (Outskill @ People Matters TechHR Summit 2026)

Status: **executed** — this document describes the plan that was built, and is kept as the architectural
reference. See [manual-test-checklist.md](./manual-test-checklist.md) for verification.

---

## 1. Goal

A booth experience for ~10,000 senior HR/business leaders across two event days that:

- captures name / email / phone,
- runs a fair, server-authoritative 7-question / 130-second challenge,
- drives a live leaderboard on an LED screen,
- lets booth staff verify the top 5 and confirm a single iPad winner after Day 2.

## 2. Architecture at a glance

```
Browser (tablet / phone / LED)
      │  fetch()  — never sees answers, never computes score
      ▼
Next.js App Router (server)
  ├── Route Handlers  src/app/api/public/*  |  src/app/api/admin/*
  ├── Validation      zod schemas at every boundary
  ├── Auth            signed HttpOnly admin cookie (jose HS256)
  ├── Tokens          signed participant + attempt tokens (jose HS256)
  └── Repositories ──► DataStore interface
                          ├── SupabaseStore  (production, SUPABASE_SECRET_KEY, server-only)
                          └── DemoStore      (DEMO_MODE=1, in-memory, fake data)
                                    │
                                    ▼
                          Supabase Postgres (RLS on, no anon policies)
                          + SQL functions for atomic operations
```

**Why a `DataStore` interface:** demo mode must be a genuine swap at one seam rather than `if (demo)`
branches sprinkled through route handlers, and it keeps route handlers free of Supabase specifics.

**Why SQL functions:** registration duplicate enforcement, attempt start, attempt finalisation, participant
reset and event locking each need to be atomic under concurrent booth traffic. Doing them as multi-step
client-side sequences would race. Each is a single `SECURITY DEFINER` Postgres function called via RPC.

## 3. Data model

| Table | Purpose |
| --- | --- |
| `participants` | one row per person; unique on `email_normalized` and `phone_e164` |
| `questions` | the 60-question bank; pillar, difficulty, options JSONB, correct option, explanation |
| `attempts` | one row per challenge run; status, timing, score, verification, disqualification |
| `attempt_questions` | exact questions and exact option order served to that attempt |
| `attempt_answers` | selected option per question, offset, correctness (computed server-side) |
| `app_settings` | single-row event configuration (copy, durations, prizes, quiz state) |
| `admin_audit_log` | every state-changing admin action |
| `rate_limit_events` | hashed-IP counters for abuse thresholds |

A view `leaderboard_view` provides authoritative ranking:
`correct_count DESC, elapsed_ms ASC, submitted_at ASC`, filtered to `status = 'submitted'` and not
disqualified/invalidated.

**Status vs timestamps.** `attempts.status` is the single source of truth for lifecycle; timestamps
(`verified_at`, `disqualified_at`, `invalidated_at`) record *when* an orthogonal flag was set. A check
constraint keeps them consistent (e.g. `disqualified_at IS NOT NULL` ⇔ `status = 'disqualified'`).

## 4. Participant flow

1. **Landing** — hook, live challenger count, best score, prize, "Take the Challenge".
2. **Register** — name/email/phone + two optional consents + required rules acknowledgement.
   `POST /api/public/register` → duplicate-safe insert → returns a signed **participant token**.
   Duplicates return one generic message that never reveals whether email or phone matched.
3. **Instructions** — no timer yet.
4. **Start** — `POST /api/public/start` selects the balanced question set, writes `attempt_questions`,
   stamps `started_at`/`deadline_at` server-side, returns a signed **attempt token** + questions
   *without* answers.
5. **Challenge** — answers are held in `sessionStorage`; **no network call per answer**. Countdown is
   driven by the server deadline.
6. **Submit** — one `POST /api/public/submit` with the attempt token and the answer array. The server
   scores against the DB, computes `elapsed_ms`, and finalises atomically. Retry is idempotent: a repeat
   submit for an already-finalised attempt returns the same stored result rather than erroring.
7. **Result** — score, time, rank, top-5 verification prompt, spin-the-wheel CTA. Kiosk mode
   (`?kiosk=1`) clears state and returns to the landing page after 25 s of inactivity.

**Timing rules.** Visible duration = 60 s. The server accepts a submission up to **3 s** after
`deadline_at`; a submission landing inside that grace window is recorded as exactly **60 000 ms**.
Anything later is `timed_out`. Unanswered questions are incorrect.

## 5. Question selection

Blueprint for 7 questions: **2 easy, 4 medium, 1 hard**. Coverage guarantee: at least one question each
from *HR & workforce*, *Responsible AI*, and *AI business judgment*. Soft rule: no more than two from any
one pillar. Selection uses `crypto.randomInt`. Question order and option order are randomised per attempt
and persisted, so a resumed attempt sees exactly the same thing.

Other supported question counts (5–10) have explicit blueprints; settings validation rejects any count
without one, so the ratio can never silently break.

## 6. Scoring, ranking, verification

- Score = correct answers out of 7. No bonus points.
- Rank = `correct_count DESC, elapsed_ms ASC, submitted_at ASC`, computed in SQL (`leaderboard_view`),
  never in the browser.
- Public display format: `7/7 · 34.8s`.
- Opted-in names show as `Ananya S.`; everyone else is `Anonymous Leader 184` (a stable per-attempt
  non-sensitive number, not a database id).
- Top-5 entries appear immediately but are badged **Pending verification** until booth staff verify.
  Only a verified, non-disqualified attempt can be the final winner, and only after the event is locked.

## 7. Admin

Password-only login (`ADMIN_PASSWORD`), compared with `timingSafeEqual`, rate-limited by hashed IP.
Success sets a signed HttpOnly `SameSite=Strict` cookie (8 h, `Secure` in production) via
`ADMIN_SESSION_SECRET`. Middleware guards `/admin/*`; every admin route handler re-verifies the session
and, for state-changing requests, checks the request `Origin`. Every mutation writes to `admin_audit_log`.

Screens: dashboard (metrics + start/pause/lock), leaderboard (verify / disqualify / restore / inspect
answers), participants (search + reset after technical failure), questions (CRUD, CSV import/template),
settings (all event copy and numbers + QR), export (CSV).

## 8. Security summary

Server-only secrets · zod on every endpoint · signed short-lived tokens (no answers inside them) ·
one valid attempt per participant enforced by a partial unique index · hashed IPs with generous
venue-friendly thresholds (never one-attempt-per-IP) · security headers + CSP · no PII in public APIs or
logs · request IDs on every error.

## 9. Testing

- **Vitest** — email/phone normalisation, public-name masking, duplicate detection, selection blueprint
  (distribution, pillar coverage, no duplicates, option shuffling), scoring, ranking + tie-breaks,
  deadline and 3-second grace handling, token sign/verify, idempotent submission, admin session verify,
  settings validation, CSV import parsing.
- **Playwright** — participant happy path, duplicate registration, timer expiry, 7/7 submission,
  leaderboard rendering, anonymous rendering, kiosk auto-reset, admin login, admin verification, paused
  state. E2E runs against `DEMO_MODE=1` so it needs no Supabase project.

## 10. Build order (as executed)

1. Config, env validation, constants, logger
2. Domain types, validation schemas, utils (phone/email/name/csv)
3. Question bank (60), selection, scoring, ranking
4. SQL migrations, RPC functions, generated seed
5. `DataStore` + Supabase and demo implementations + repositories
6. Public APIs → participant UI → leaderboard/display/QR
7. Admin auth → admin APIs → admin UI
8. Tests, scripts, docs
9. lint / typecheck / test / build / e2e
