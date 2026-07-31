# Setup guide

**For the project owner. No prior development experience assumed.**

This walks you from a blank laptop to a live challenge that visitors can scan at the booth. Follow it
in order. Each step says what you are doing and why.

Total time: about 45 minutes the first time.

---

## A few words you will meet

| Word | What it means here |
| --- | --- |
| **Terminal** | An app where you type commands instead of clicking buttons. On a Mac it is called *Terminal*; on Windows, *PowerShell*. You type a line and press Enter. |
| **Node.js** | The engine that runs this application. Like needing Excel installed to open a spreadsheet. |
| **npm** | Comes with Node.js. It downloads the code libraries this project depends on. |
| **Environment variable** | A setting stored outside the code — usually a password or an address. Kept separate so secrets are never accidentally shared. |
| **Migration** | A file of database instructions that creates the tables. You run it once, in order. |
| **Seed** | Loading the starting data — here, the 120 questions and the default event settings. |
| **Deploy** | Putting the app on the internet so a phone at the venue can reach it. |

Throughout, a block like this is something to **copy and paste into the terminal, then press Enter**:

```bash
echo hello
```

---

## Step 1 — Install Node.js

1. Go to <https://nodejs.org>.
2. Download the **LTS** version (the left-hand button). LTS means "long-term support" — the stable one.
3. Open the downloaded file and click through the installer, accepting the defaults.
4. Open your terminal:
   - **Mac**: press `Cmd + Space`, type `Terminal`, press Enter.
   - **Windows**: press the Start key, type `PowerShell`, press Enter.
5. Check it worked:

   ```bash
   node --version
   ```

   You should see something like `v22.x.x` or `v24.x.x`. If you see "command not found", close the
   terminal, open a new one, and try again — a fresh terminal picks up the new installation.

---

## Step 2 — Open the project and install its dependencies

In the terminal, move into the project folder. Replace the path if you saved it elsewhere:

```bash
cd ~/outskill-ai-leadership-challenge
```

Now download everything the project needs. This takes a minute or two and prints a lot of text — that
is normal.

```bash
npm install
```

---

## Step 3 — Look around before setting up a database (optional but recommended)

You can preview every screen right now, with fake data.

Create a file called `.env.local`:

```bash
cp .env.example .env.local
```

Open `.env.local` in any text editor and change the demo line to:

```
DEMO_MODE=1
```

Then start the app:

```bash
npm run dev
```

Open <http://localhost:3000> in your browser. You will see a yellow **DEMO MODE** badge on screen.
Everything works — the challenge, the leaderboard, the LED display, the admin screens (password
`demo-admin`) — but nothing is saved. Press `Ctrl + C` in the terminal to stop.

**Remove the `DEMO_MODE=1` line before going live.** The app refuses to run in demo mode on a real
production deployment, but it is cleaner not to have it there at all.

---

## Step 4 — Create a Supabase project (the real database)

1. Go to <https://supabase.com> and sign up (free tier is plenty for this event).
2. Click **New project**.
3. Fill in:
   - **Name**: `outskill-ai-challenge`
   - **Database password**: click *Generate*, then **save it in your password manager**. You will not
     need it for this app, but you will need it if you ever connect directly.
   - **Region**: choose the one closest to Delhi — usually **South Asia (Mumbai)**. A closer region
     means a faster leaderboard at the booth.
4. Click **Create new project** and wait about two minutes while it sets up.

---

## Step 5 — Find your Supabase project URL

1. In your Supabase project, click the **gear icon** (Project Settings) in the left sidebar.
2. Click **Data API**.
3. Copy the value under **Project URL**. It looks like `https://abcdefghijk.supabase.co`.

Keep it handy — you will paste it in Step 7.

---

## Step 6 — Find your Supabase secret key

1. Still in **Project Settings**, click **API Keys**.
2. Find the **Secret keys** section. (In older Supabase interfaces this is called the `service_role`
   key.)
3. Click **Reveal**, then copy the key.

> **This key can read and change everything in your database.** Never paste it into a chat, an email,
> a screenshot or a public website. It only ever goes into `.env.local` on your own laptop and into
> your Vercel project settings. If it ever leaks, return to this page and rotate it immediately.

---

## Step 7 — Create your `.env.local` file

If you did not already do it in Step 3:

```bash
cp .env.example .env.local
```

Open `.env.local` in a text editor. You now need to fill in seven values.

**First, generate the three secrets and the admin password.** Run each line and copy what it prints:

```bash
node -e "console.log('ADMIN_SESSION_SECRET=' + require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log('ATTEMPT_SIGNING_SECRET=' + require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log('IP_HASH_SECRET=' + require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log('ADMIN_PASSWORD=' + require('crypto').randomBytes(9).toString('base64url'))"
```

Your finished `.env.local` should look like this (with your own values):

```
SUPABASE_URL=https://abcdefghijk.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...................................
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_USERNAME=outskill-admin
ADMIN_PASSWORD=Kx7ta9QzP1vB
ADMIN_SESSION_SECRET=................................................
ATTEMPT_SIGNING_SECRET=..........................................
IP_HASH_SECRET=.................................................
EVENT_TIMEZONE=Asia/Kolkata
```

Save the file.

> `.env.local` is deliberately excluded from version control, so your secrets are never committed.
> Share the admin password with booth staff verbally or through a password manager — not over email.

---

## Step 8 — Create the database tables (run the migrations)

1. In Supabase, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. On your laptop, open the file `supabase/migrations/0001_schema.sql`. Select all of it, copy it,
   paste it into the Supabase editor, and click **Run**.
   - You should see *Success. No rows returned.*
4. Click **New query** again. Repeat with `supabase/migrations/0002_functions.sql`.

If you would rather have the terminal show you the files in order:

```bash
npm run migrate:print
```

---

## Step 9 — Load the 120 seed questions

Two ways. Pick either.

**Option A — one command (easiest):**

```bash
npm run seed
```

You should see `The question bank now holds 120 questions.`

**Option B — paste SQL:** open `supabase/seed.sql`, copy all of it, paste into a new Supabase SQL
Editor query, and click **Run**.

---

## Step 10 — Run it on your laptop

```bash
npm run dev
```

Open <http://localhost:3000>. You should see the landing page with a challenger count of 0.

Take the challenge once yourself, end to end. Then check <http://localhost:3000/leaderboard> — your
entry should be there.

Press `Ctrl + C` in the terminal to stop the app.

---

## Step 11 — Sign in to the admin screens

1. Go to <http://localhost:3000/admin>.
2. Enter the `ADMIN_USERNAME` and `ADMIN_PASSWORD` from your `.env.local`. The whole booth team
   shares this one account, and every signed-in admin has every permission.
3. You land on the dashboard.

**Do this before the event:** open **Questions**, read all 60, and change each from *reviewed* to
*approved* once you are happy with it. They are deliberately shipped as *reviewed* so a human signs
them off before 10,000 senior leaders see them.

Also open **Settings** and replace the *Privacy contact text* placeholder with how people should
actually contact Outskill about their data.

---

## Step 12 — Run the tests

Confidence check before you deploy.

```bash
npm run lint        # code style
npm run typecheck   # type errors
npm run test        # unit tests — should say "212 passed"
npm run build       # production build
```

The browser tests take longer and start their own server:

```bash
npm run test:e2e
```

The first time, it may ask you to install browsers:

```bash
npx playwright install
```

---

## Step 13 — Deploy to Vercel

Vercel hosts Next.js applications and has a free tier that comfortably handles this event.

> **macOS only, first time:** the `git` command needs Apple's Command Line Tools. If you see
> *"No developer tools were found"*, run this once and click **Install** in the dialog that appears
> (it takes a few minutes):
>
> ```bash
> xcode-select --install
> ```

1. Put the code on GitHub:
   - Create a free account at <https://github.com>.
   - Create a new **private** repository called `outskill-ai-challenge`.
   - Follow GitHub's "push an existing repository" instructions, which look like:

     ```bash
     git init
     git add .
     git commit -m "Outskill AI Leadership Challenge"
     git branch -M main
     git remote add origin https://github.com/YOUR-USERNAME/outskill-ai-challenge.git
     git push -u origin main
     ```

2. Go to <https://vercel.com> and sign up with your GitHub account.
3. Click **Add New → Project**, find your repository, click **Import**.
4. Leave every build setting at its default — Vercel detects Next.js automatically.
5. **Do not click Deploy yet.** Do Step 14 first.

---

## Step 14 — Add the environment variables in Vercel

On the import screen (or later under **Project Settings → Environment Variables**), add each of these.
Choose **All Environments** unless noted.

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Same as `.env.local` |
| `SUPABASE_SECRET_KEY` | Same as `.env.local` |
| `ADMIN_USERNAME` | Same as `.env.local` |
| `ADMIN_PASSWORD` | Same as `.env.local` |
| `ADMIN_SESSION_SECRET` | Same as `.env.local` |
| `ATTEMPT_SIGNING_SECRET` | Same as `.env.local` |
| `IP_HASH_SECRET` | Same as `.env.local` |
| `EVENT_TIMEZONE` | `Asia/Kolkata` |
| `NEXT_PUBLIC_APP_URL` | Your final address, e.g. `https://outskill-ai-challenge.vercel.app` |

Two things to watch:

- **Do not add `DEMO_MODE`.** The app refuses to start in demo mode on production, by design.
- `NEXT_PUBLIC_APP_URL` is what the QR code encodes. If you change it later you must redeploy
  (Step 15) and reprint the QR poster.

Now click **Deploy**. It takes two or three minutes.

---

## Step 15 — Redeploy after changing a setting

Environment variables are read when the app is built, so changing one needs a redeploy:

1. Vercel → your project → **Deployments**.
2. Find the newest deployment, click the **⋯** menu, choose **Redeploy**.
3. Leave "Use existing build cache" unticked, and confirm.

---

## Step 16 — Set up a booth tablet (kiosk mode)

Kiosk mode clears each visitor's details from the tablet. After they submit, their score and answer
review stay up for **40 seconds** with a visible countdown, then the tablet resets itself for the next
person. Staff can reset instantly with the **Done — Next Participant** button instead of waiting.

Everything is cleared on reset: the attempt token, the answers, the result and all session storage.
The browser back gesture cannot bring the previous participant's result back.

On each tablet:

1. Open Safari (iPad) or Chrome (Android).
2. Go to **`https://your-address.vercel.app/challenge?kiosk=1`** — the `?kiosk=1` matters.
3. Add it to the home screen so it opens without browser chrome:
   - **iPad**: tap Share → *Add to Home Screen*.
   - **Android**: tap ⋮ → *Add to Home screen*.
4. In the tablet's settings, turn on **Guided Access** (iPad) or **Screen Pinning** (Android) so
   visitors cannot leave the app.
5. Set **Auto-Lock / Screen timeout** to **Never** and plug the tablet into power. The app asks the
   browser to keep the screen awake where that is supported, but **you must still turn off auto-lock
   by hand** — the browser cannot override the device setting.

Repeat on all five tablets. Participation happens on these tablets only: there is no public QR code
and no "scan to play" prompt on any participant screen or on the TV.

---

## Step 17 — Open the TV display

The TV route is **`/display`**. It needs no sign-in. There are two ways to drive it — pick whichever
the venue makes easy.

**Option A — a smart TV's own browser:**

1. Open the TV's web browser and go to **`https://your-address.vercel.app/display`**.
2. Click **Full screen**.
3. In the TV's settings, turn off any screensaver, sleep timer or ambient mode.

**Option B — a laptop connected over HDMI (more reliable):**

1. Connect the laptop to the TV and set the display to **mirror** or **extend** at **1920×1080**.
2. Open **`https://your-address.vercel.app/display`** in Chrome.
3. Click **Full screen** (or press `F11`).
4. Set the laptop to never sleep and never show a screensaver, and plug it into power.

The display rotates through three scenes roughly every 11 seconds — the live **top 5**, the event
pulse, and an Outskill brand message. It refreshes every 10 seconds, retries automatically if the
venue Wi-Fi drops (a small indicator turns amber while it reconnects), and keeps working after the
challenge is locked. There is deliberately **no QR code** in the rotation.

---

## Step 18 — Print the QR code

1. Sign in at `/admin` and go to **Settings → QR poster** (or go straight to `/qr`).
2. Click **Print** for an A4 sheet, or **SVG** / **PNG** to download the code for a larger banner.
3. **Test the printed code**: scan it with a phone from about a metre away. It must open the landing
   page, not the admin screen.

---

## Step 19 — Test on a phone using the QR code

1. Scan the printed code with your own phone, on mobile data rather than the office Wi-Fi — that is
   closer to what a visitor experiences.
2. Complete a full run.
3. Check the entry appears on `/leaderboard` and in `/admin/leaderboard`.
4. Delete that test entry's effect by disqualifying it in `/admin/leaderboard` (reason: "pre-event
   test entry") so it does not compete for the prize.

---

## Step 20 — Export the leads

At any point, and especially at the end of each day:

1. Sign in at `/admin`.
2. Go to **Export**.
3. Click **Download CSV** under **Leads**.
4. Open it in Excel or Google Sheets.

The `marketing_opt_in` column tells you who agreed to follow-up. **Only contact people whose value is
`true`.**

---

## What the event does and does not do

A few things worth knowing before the doors open, because they are deliberate choices rather than
gaps:

**No result emails.** Nothing is emailed to a participant, ever. Their score and a review of all seven
answers appear on the tablet immediately after they submit, and only there. The email address is
collected as a lead and to verify prize winners — giving it does not sign anyone up for marketing,
which is a separate optional tick box.

**The answer review hides the answer key on purpose.** A participant sees each question, the option
they chose, a Correct / Incorrect / Not answered badge, and the principle behind the question. They are
never shown which option was the right one. Two days of a busy booth with a shared question bank means
anyone reading over a shoulder would otherwise learn the answers. Admins can still see the full key in
`/admin` → Leaderboard → **Inspect**.

**Nothing closes on a timer.** The challenge stays open until an admin locks it by hand in
`/admin/dashboard`. Locking asks you to type a confirmation phrase; unlocking asks for a different one.
When paused or locked, no new registrations or attempts start, but anyone already mid-attempt can still
submit until their own deadline — nobody loses a run because of the timing of a click. The TV display
and the CSV export keep working while locked.

**Verification is for the top 5.** Entries in the top five must be verified in person at the Outskill
desk before they can win. Verify them in `/admin/leaderboard`.

**Capacity.** The database, the leaderboard queries and the CSV exports are indexed and tested for at
least 2,500 participants and attempts, which is the expected footfall across both days. There is no
lower cap anywhere in the application. Note that 2,500 is total footfall, not concurrent users: the
live setup is five tablets, one TV and six or seven admins against **one shared Supabase project**.

**Seven-day retention.** Participant details are kept for seven days after the event. Export the leads
CSV first (`/admin/export`), then anonymise the personal data. See the runbook for the wording to use
with participants.

---

## Health check before the doors open

With the site deployed:

```bash
npm run load:smoke -- --url https://your-address.vercel.app
```

This only reads the public landing page, leaderboard and stats — it never creates participants, so it
is safe to run against the live site.

---

## If something goes wrong

| Symptom | What to do |
| --- | --- |
| `command not found: node` | Node.js is not installed, or you need a fresh terminal window. Redo Step 1. |
| `Missing or invalid environment variable ...` | That variable is empty or missing in `.env.local` (or in Vercel). Check for typos and stray spaces. |
| "The app_settings row is missing" | You ran the migrations but not the seed. Do Step 9. |
| "The challenge is being set up" on `/challenge` | The question bank is empty or all questions are inactive. Check `/admin/questions`. |
| Admin sign-in not accepted | `ADMIN_USERNAME` or `ADMIN_PASSWORD` in Vercel differs from what you are typing. The error is deliberately the same for both. Fix it, then redeploy (Step 15). |
| Everything shows a DEMO MODE badge | `DEMO_MODE` is still set. Remove it and restart or redeploy. |
| Leaderboard is empty but people have played | Check `/admin/leaderboard` — entries may have been disqualified, or the quiz may be paused. |

For anything on the day itself, see **[event-day-runbook.md](event-day-runbook.md)**.
