# The AI Leadership Challenge

**Outskill @ People Matters TechHR Summit 2026 · Delhi, India · 6–7 August 2026**

> Can you make the right AI decisions under pressure?
> 7 leadership decisions. 130 seconds. One live leaderboard.

A booth engagement experience for senior HR and business leaders. Visitors answer seven workplace AI
decisions against a 130-second clock on one of five booth tablets; scores appear on a live leaderboard
shown on a TV; the top-ranked verified entry wins an iPad once the Outskill team locks the challenge.

---

## What it does

| Screen | Route | Who it is for |
| --- | --- | --- |
| Landing / attraction | `/` | Visitors, on a booth tablet |
| The challenge | `/challenge?kiosk=1` on booth tablets | Visitors |
| Public leaderboard | `/leaderboard` | Visitors |
| TV display | `/display` | The big screen at the booth |
| Rules / Privacy | `/rules`, `/privacy` | Visitors |
| Event admin | `/admin` | Outskill booth staff |
| Printable QR poster | `/qr` | Booth staff only — not linked from any participant screen |

It captures **name, email and phone only**. It never asks for company, title, designation, address or
a password. It uses **no AI at runtime** — questions are a curated bank managed from the admin screens.

**There are no result emails.** A participant's score and a review of all seven of their answers appear
on the tablet immediately after they submit, and only there.

---

## Quick start

You need Node.js 20.9 or newer. If you have never installed it, follow
[docs/setup-guide.md](docs/setup-guide.md), which assumes no prior experience.

```bash
npm install                # install dependencies
cp .env.example .env.local # then fill in the values (see the setup guide)
npm run dev                # start the app at http://localhost:3000
```

**Want to look around before setting up a database?** Set `DEMO_MODE=1` in `.env.local` and run
`npm run dev`. Every screen works against obviously fake in-memory data, with a "DEMO MODE" badge on
screen. Demo mode cannot be switched on in a production deployment.

---

## The event configuration

| Setting | Value |
| --- | --- |
| Questions per participant | 7 |
| Total quiz time | 130 seconds |
| Difficulty mix per attempt | 2 easy · 4 medium · 1 hard |
| Result and answer-review window | 40 seconds |
| Public leaderboard | Top 5 |
| TV leaderboard | Top 5 |
| Leaderboard refresh | Every 10 seconds |
| Attempts allowed | One per email **and** one per phone number |
| Competition close | Manual admin lock only — nothing closes on a timer |
| Event timezone | Asia/Kolkata |
| Booth setup | Five tablets, one TV, one shared Supabase project |
| Expected footfall | ~2,500 people across both days |

The question bank holds **120 questions**: 40 easy / 60 medium / 20 hard, 24 in each of the five
pillars, all active and approved.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally at <http://localhost:3000> |
| `npm run build` | Build for production |
| `npm start` | Run the production build |
| `npm run lint` | Check code style and React/Next rules |
| `npm run typecheck` | Check TypeScript types |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run browser tests (Playwright) |
| `npm run seed` | Load the 120 seed questions and default settings into Supabase |
| `npm run seed:sql` | Regenerate `supabase/seed.sql` from the TypeScript question bank |
| `npm run migrate:print` | Print the SQL files to run, in order (`-- --full` prints the SQL itself) |
| `npm run load:smoke` | Read-only health check of the public pages and APIs |

---

## Documentation

- **[docs/setup-guide.md](docs/setup-guide.md)** — step-by-step setup, from installing Node.js to
  deploying on Vercel. Written for a non-developer.
- **[docs/event-day-runbook.md](docs/event-day-runbook.md)** — what booth staff do on the day.
  Print this.
- **[docs/manual-test-checklist.md](docs/manual-test-checklist.md)** — the final pre-event walkthrough.
- **[docs/implementation-plan.md](docs/implementation-plan.md)** — architecture and design decisions.
- **[AGENTS.md](AGENTS.md)** — conventions and rules for anyone (or anything) changing the code.

---

## How it is built

- **Next.js (App Router)** with TypeScript in strict mode, React and Tailwind CSS v4
- **Supabase Postgres** as the database, reached only from server-side code with the secret key
- **Zod** validates every request; **jose** signs participant, attempt and admin-session tokens
- **Vitest** for unit tests, **Playwright** for browser tests

Business logic lives in `src/lib/`, never in components. Database access is behind a single
`DataStore` interface, which is what lets demo mode swap the entire backend at one seam.

### Things the design deliberately guarantees

- **Correct answers never reach the browser.** They are stripped in one mapper on the server while the
  challenge runs, and in a second mapper (`src/lib/quiz/review.ts`) when the answer review is built.
- **The answer review teaches without giving the key away.** A participant sees whether they were right
  and the principle behind each question. They never see which option was correct, and the review
  payload carries no `correct_option_id` and no text for options they did not pick.
- **The server owns the clock and the score.** Client-supplied timings, scores and ranks are ignored.
- **Duplicate entries are blocked by the database**, on both email and phone, with a message that
  never reveals which one matched.
- **Every attempt gets a comparable challenge**: 2 easy, 4 medium, 1 hard, with guaranteed coverage of
  HR & workforce, Responsible AI, and AI business judgment.
- **Submission is idempotent**, so a retry over bad venue Wi-Fi cannot create a second attempt.
- **A kiosk tablet forgets each participant.** After 40 seconds — or as soon as staff tap
  *Done — Next Participant* — session storage, attempt tokens, answers and results are cleared, and the
  browser back gesture cannot bring the previous person's result back.
- **No personal data is logged**, and IP addresses are stored only as a salted one-way hash.

---

## Environment variables

See [.env.example](.env.example) for the full list with descriptions. In short:

```
SUPABASE_URL=              # Supabase project URL
SUPABASE_SECRET_KEY=       # Supabase secret key — server only, never share
NEXT_PUBLIC_APP_URL=       # public address of the deployment
ADMIN_USERNAME=            # shared username booth staff type at /admin
ADMIN_PASSWORD=            # shared password booth staff type at /admin
ADMIN_SESSION_SECRET=      # signs the admin cookie (32+ chars)
ATTEMPT_SIGNING_SECRET=    # signs participant/attempt tokens (32+ chars)
IP_HASH_SECRET=            # salts the one-way IP hash (32+ chars)
EVENT_TIMEZONE=Asia/Kolkata
```

Never prefix a secret with `NEXT_PUBLIC_` — that publishes it to every visitor's browser.

One shared admin account is used by the whole booth team. Every signed-in admin has every permission,
and the audit log records the shared identity plus a per-session id rather than a named person.

---

## The Outskill logo

`public/outskill-logo.svg` is a **placeholder**. To use the official mark, drop the real file in at
that exact path and set `NEXT_PUBLIC_HAS_OFFICIAL_LOGO=1`. Until then the app shows a clean text
wordmark. See [public/README.md](public/README.md).

---

## Before the event

1. Read the 120 questions in `/admin/questions`. They ship active and approved, so the bank is servable
   straight away — but a human should still read them before 2,500 senior leaders do. The bank summary
   at the top of that screen confirms the counts and flags any validation problem.
2. Replace the placeholder contact wording in `/admin/settings` → *Privacy contact text*.
3. Work through [docs/manual-test-checklist.md](docs/manual-test-checklist.md).
4. Set up the five tablets on `/challenge?kiosk=1` and the TV on `/display`.
