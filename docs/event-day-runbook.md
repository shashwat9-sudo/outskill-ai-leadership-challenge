# Event-day runbook

**The AI Leadership Challenge · Outskill**
People Matters TechHR Summit 2026 · Delhi · 6–7 August 2026

**Print this. Keep a copy at the booth.**

Written for the operations team. No technical knowledge assumed.

---

## The one-page version

| I need to… | Do this |
| --- | --- |
| Open the challenge for a visitor | Hand them a tablet showing the start screen, or point at the QR code |
| Check the leaderboard | `/leaderboard` on any device |
| Sign in as staff | `/admin` → type the admin password |
| Pause everything | Admin → Dashboard → **Pause** |
| Verify a top-5 person | Admin → Leaderboard → find them → **Verify** |
| Someone's tablet froze | Admin → Participants → search their name → **Reset** |
| Close the event on Day 2 | Admin → Dashboard → **Lock** → type `LOCK THE CHALLENGE` |
| Get the leads | Admin → Export → **Download CSV** under *Leads* |

**Write these on the whiteboard before you start:**

- Public address: `https://__________________________________`
- Admin password: kept by ______________________ (not written here)

---

## 1. Opening the participant app

**On a visitor's own phone:** they scan the QR code on the LED screen or the printed poster. It opens
the landing page. Nothing else to do.

**On a booth tablet:** the app should already be open in kiosk mode. If a tablet is showing something
else, open the browser and go to:

```
https://your-address/challenge?kiosk=1
```

The `?kiosk=1` on the end matters. Without it, the tablet keeps the previous visitor's details on
screen instead of clearing them.

---

## 2. Kiosk mode — what it does

With `?kiosk=1`:

- The visitor's details are cleared from the tablet as soon as they finish.
- The result and answer review stay up for **40 seconds**, with a visible countdown, then the tablet
  returns to the start screen and forgets the participant entirely.
- Staff can reset instantly with the **Done — Next Participant** button rather than waiting.
- The page footer is hidden so there is less to tap by accident.

Without it (a visitor's own phone), their result stays on screen so they can show it at the desk.

---

## 3. Setting up the five tablets

Do this the evening before, or at least an hour before doors open.

For each tablet:

1. Charge it fully and plug it into power at the booth.
2. Settings → Display → **Auto-Lock: Never**.
3. Open the browser and go to `https://your-address/challenge?kiosk=1`.
4. Add it to the home screen:
   - **iPad**: Share button → *Add to Home Screen* → Add.
   - **Android**: ⋮ menu → *Add to Home screen*.
5. Open it from the home screen icon (it now fills the screen with no address bar).
6. Lock the visitor into the app:
   - **iPad**: Settings → Accessibility → Guided Access → on. Then triple-click the side button in
     the app to start Guided Access. Set a passcode the team knows.
   - **Android**: Settings → Security → Screen pinning → on. Then pin the app from the recents view.
7. Run one full test challenge on each tablet using a fake name and an email like
   `booth.test.1@example.invalid`. Confirm the result screen appears.
8. Afterwards, go to Admin → Leaderboard and **disqualify** those test entries with the reason
   "pre-event booth test" so they do not compete for the prize.

**Number the tablets 1 to 5 with a sticker.** When something goes wrong you want to be able to say
"tablet 3".

---

## 4. Opening the LED display

On the laptop connected to the big screen:

1. Open the browser and go to `https://your-address/display`.
2. Click the **Full screen** button at the top right (or press `F11`).
3. Confirm the resolution is **1920×1080**.
4. Set the laptop to never sleep, and turn off the screensaver.
5. Leave the browser tab in the foreground. The display pauses updating if the tab is hidden.

The screen rotates every ~11 seconds through:

1. **Live Top 5** — the leaderboard
2. **Event pulse** — challengers, average score, best score, toughest pillar
3. **Call to action** — "Think you can beat the leaderboard?" with the QR code

If it freezes, press `F5` to reload. Nothing is lost.

---

## 5. Generating and printing the QR code

1. Sign in at `/admin`.
2. Go to **Settings**, click **QR poster** (top right). Or go straight to `https://your-address/qr`.
3. Click **Print** for an A4 sheet, or **SVG** / **PNG** to download for a large banner.
4. **Test the printed code before the doors open.** Scan it with a phone from about a metre away. It
   must open the landing page — never the admin screen.

The caption under the QR code is editable in Admin → Settings → *QR caption*.

---

## 6. Starting and pausing the challenge

Sign in at `/admin` → **Dashboard**. The status is shown at the top:

- **Active — accepting entries** (normal)
- **Paused — no new entries** (visitors see a friendly "paused" message)
- **Locked — event closed** (final; see section 11)

**To pause** (lunch break, a technical problem, a keynote taking everyone away): click **Pause**.
Anyone already mid-challenge finishes normally. New visitors see a message asking them to check with
the team.

**To resume**: click **Start**.

Pausing and resuming is safe and can be done as often as you like.

---

## 7. Verifying top-5 participants

**Only a verified entry can win the prize.** Do this continuously through both days — do not leave it
all to Day 2 evening.

When someone's result screen says "You're in the Top 5":

1. Ask them to come to the Outskill desk.
2. Sign in at `/admin` → **Leaderboard**.
3. Find their row — search by name, email or phone in the search box.
4. **Check in person** (see section 8).
5. Click **Verify**. The badge changes from *Pending* to *Verified*.

If someone drops out of the top 5 later, their verification stays recorded. That is fine.

To undo a verification, click **Un-verify** on the same row.

---

## 8. Confirming badge and phone details manually

Before clicking Verify, check all three:

1. **Badge** — the name on their event badge matches the name in the admin row.
2. **Phone** — read the last four digits from the admin screen and ask them to confirm. Do not read
   the whole number aloud; other visitors are standing there.
3. **Email** — ask them to say their email address and check it matches.

If anything does not match, **do not verify**. Note it and escalate to the booth lead.

Common innocent mismatches:

- Badge shows a formal name, registration used a short form ("Siddharth" vs "Sid") — fine, verify.
- Registered on a colleague's phone by accident — that person must re-register with their own details;
  use **Reset** (section 10) if needed.

---

## 9. Disqualifying a fraudulent entry

Use this when an entry should not compete: someone entered twice with different details, someone
played on behalf of a colleague, or an entry is obviously automated.

1. `/admin` → **Leaderboard**.
2. Find the row → click **Disqualify**.
3. **Type a reason.** It is required and permanently recorded. Be factual, for example:
   *"Second entry by the same person using a different email; confirmed at the desk."*
4. Click **Confirm disqualification**.

The entry disappears from the public leaderboard immediately. **Nothing is deleted** — the record is
kept, along with who did it and why.

**To undo**: find the row (it now shows *Disqualified*) and click **Restore**. Confirm when asked.

---

## 10. Resetting after a genuine technical failure

Use this when the app failed the participant — a frozen tablet, Wi-Fi dropping mid-run, a tablet that
died on battery. **Not** for someone who just wants another go.

1. `/admin` → **Participants**.
2. Search their name, email or phone.
3. Click **Reset** on their row.
4. Type what happened, e.g. *"Tablet 3 froze at question 4, confirmed by booth staff."*
5. Click **Confirm reset**.

What happens: their previous attempt is removed from the leaderboard but kept in the records, and they
may take **exactly one** replacement attempt.

Then: hand them a working tablet and ask them to open the challenge and register again with the same
email — they will be recognised.

---

## 11. Locking the quiz at the end of Day 2

**Do this only once, when the challenge is genuinely closed.**

1. `/admin` → **Dashboard**.
2. Click **Lock**.
3. Type exactly: `LOCK THE CHALLENGE`
4. Click **Confirm**.

After locking, nobody can register or start a challenge. Visitors see a closing message.

**If you lock by mistake**: click **Start** and type `UNLOCK THE CHALLENGE`. Only do this if the lock
was genuinely an error — reopening a closed competition after people have gone home is unfair.

---

## 12. Confirming the final winner

After locking:

1. `/admin` → **Dashboard**. Look at **Winner tracking**:
   - **Provisional winner (rank 1)** — the top entry, verified or not.
   - **Highest verified entry** — the top entry that has been verified in person.
2. **The prize goes to the highest verified, non-disqualified entry.**
3. If the provisional winner is *not* verified, either:
   - find them and verify them now (if they are still at the venue), or
   - award to the highest verified entry.
4. Cross-check on `/admin/leaderboard`: the winning row must show **Verified** and must **not** show
   *Disqualified*.
5. Note the winner's name, email and phone from the admin screen for the prize handover.

Second and third prizes follow the same rule, working down the verified entries.

---

## 13. Exporting all leads

Do this **at the end of each day**, not just at the end.

1. `/admin` → **Export**.
2. Click **Download CSV** under **Leads**.
3. Save it somewhere backed up, and name it clearly: `outskill-leads-day1.csv`.

The file contains name, email, phone, company, designation, both consent flags and their result.

> **Only contact people whose `marketing_opt_in` column says `true`.** That column is the record of
> what they agreed to. The `public_leaderboard_opt_in` column is a different consent and does not
> permit follow-up.

The Leads file contains, per participant: id, name, email, phone, company, designation, registration and
submission times in both UTC and Asia/Kolkata, score, questions attempted and correct, completion time in
milliseconds and in seconds, rank, both consent flags, verification status and time, and disqualification
status and reason. It is tested to handle at least 2,500 records without truncation.

Two reasons a lead column can be empty, and neither is a fault to correct by hand:

- **`designation` blank** — the job title is optional on the form, so a participant may simply have
  skipped it.
- **`company_name` blank** — the participant registered before these fields existed. Company is
  required of every registration taken since.

Other exports available on the same screen: full attempt data, a public-safe leaderboard (masked names,
safe to share), and the question bank.

---

## 13a. Seven-day retention and anonymising afterwards

Participant details are kept for **seven days after the event ends**, then anonymised. Nothing expires
or deletes itself — a person has to do it.

The **Data retention** panel on `/admin` → **Export** shows, at a glance:

- the event end date
- the retention deadline
- how many days remain (or how many days overdue it is)
- whether a lead export has been recorded
- how many participant records have already been anonymised

**When the seven days are up:**

1. Make absolutely sure the Leads CSV is downloaded and backed up. The panel will not let you proceed
   until an export has been recorded, but check the file opens.
2. On the retention panel, re-enter the shared **admin password**.
3. Type the confirmation phrase **`ANONYMISE PARTICIPANT DATA`** exactly.
4. Click **Anonymise participant data**.

This permanently replaces every name, email address and phone number with a placeholder. **It cannot be
undone.** Scores, completion times and rankings are kept, so the leaderboard and the event statistics
still work — the people behind them simply become unidentifiable, and everyone shows on the public
board as "Anonymous Leader".

The audit log records that the anonymisation happened, by whom and how many records were affected. It
deliberately records no participant details.

---

## 14. If the Wi-Fi fails

**Symptoms:** the leaderboard stops updating; visitors see "You are offline" or "The connection is
unstable" while playing.

**What still works:** a challenge already in progress keeps running. The visitor's answers are saved on
the device and the timer keeps counting.

**What to do:**

1. Stay calm and keep the queue moving — people mid-run are not losing anything.
2. When the connection returns, in-progress challenges submit automatically. If someone is stuck on
   "Submitting your answers", ask them to press **Try submitting again**.
3. If Wi-Fi is out for more than a couple of minutes, **Pause** the challenge (section 6) so new
   visitors are not caught mid-run.
4. Switch a tablet to a phone hotspot if you have one.
5. If someone genuinely lost a run because of it, use **Reset** (section 10).

**Do not** tell visitors the app works offline. Scoring happens on the server, so submission needs a
connection.

---

## 15. If a tablet freezes

1. Force-quit the app and reopen it from the home screen icon.
2. If that fails, restart the tablet. Everything is on the server; nothing is lost.
3. Swap in a spare tablet and keep the queue moving.
4. If the visitor was mid-challenge, apologise and use **Reset** (section 10) so they can start again.
5. Note the tablet number and how many times it has happened. If one tablet does it twice, take it out
   of service.

---

## 16. If the database is unavailable

**Symptoms:** visitors see *"We could not reach the challenge database. Please try again in a moment"*,
or *"Something went wrong at our end"* with a reference code.

1. **Write down the reference code** shown on screen. It identifies the exact failure in the logs.
2. Check whether it affects everyone: open `/leaderboard` on your own phone.
   - Only one device affected → it is that device or its connection. Restart it.
   - Everything affected → continue.
3. Check <https://status.supabase.com> for an outage.
4. **Pause** the challenge (section 6) so people are not caught mid-run.
5. Put up a sign: *"The challenge is taking a short break — back in a few minutes."*
6. Contact the technical owner with the reference code.
7. When it recovers, click **Start** and resume.

**Nothing that was already saved is lost by an outage.** Completed entries stay on the leaderboard.

---

## 17. How to avoid wiping genuine event data

Things that are **safe** and can be undone:

- Pause and Start
- Verify and Un-verify
- Disqualify and Restore
- Editing settings, prizes and copy
- Editing or deactivating questions

Things to be careful with:

- **Lock** — needs a typed phrase for a reason. Only at the true end of Day 2.
- **Reset** — gives someone a second attempt. Only after a genuine technical failure.
- **Unlock after locking** — reopens a closed competition.

Things that **cannot** happen from the admin screens, by design:

- Deleting a participant
- Deleting an attempt
- Deleting a question (only deactivating)
- Changing someone's score

**Never** ask anyone to "clear the database", "reset the app" or "start fresh" during the event.
If someone suggests it, stop and call the technical owner.

---

## 18. Pre-event checklist

Complete the evening before Day 1.

- [ ] The public address opens on a phone using mobile data (not office Wi-Fi)
- [ ] All 120 questions read and marked **approved** in Admin → Questions
- [ ] Privacy contact text in Admin → Settings replaced with real wording
- [ ] Prize text in Admin → Settings correct (iPad + Custom AI Session + Hamper, etc.)
- [ ] Event dates and winner announcement time correct in Admin → Settings
- [ ] Admin password known by at least two people on the team
- [ ] Five tablets charged, in kiosk mode, on power, auto-lock off, screen-pinned
- [ ] One full test challenge completed on **each** tablet
- [ ] Test entries disqualified with reason "pre-event booth test"
- [ ] LED display running full screen at 1920×1080
- [ ] QR poster printed and **scan-tested from a metre away**
- [ ] Challenge status is **Active**
- [ ] Leaderboard shows the test entries correctly, with masked names
- [ ] Spare tablet available
- [ ] Phone hotspot available as a Wi-Fi fallback
- [ ] This runbook printed and at the desk

---

## 19. Day 1 closing checklist

- [ ] Verify any remaining top-5 participants who are still at the venue
- [ ] Export the leads CSV and save it as `outskill-leads-day1.csv`
- [ ] Note the current top 3 (screenshot the leaderboard)
- [ ] Review Admin → Export → audit log for anything unexpected
- [ ] **Do not lock the challenge** — Day 2 is still to come
- [ ] Leave the status as **Active**, or **Pause** overnight if you prefer
- [ ] Put the tablets on charge
- [ ] Turn off or lock the LED laptop

> If you paused overnight, the very first job on Day 2 is to press **Start**.

---

## 20. Day 2 winner checklist

- [ ] Announce a "last chance" ~30 minutes before closing
- [ ] Verify every unverified person in the top 5 while they are still on site
- [ ] At closing time: Dashboard → **Lock** → type `LOCK THE CHALLENGE` → Confirm
- [ ] Confirm the status reads **Locked — event closed**
- [ ] Read **Winner tracking** on the dashboard
- [ ] Confirm the winning entry is **Verified** and **not Disqualified** on Admin → Leaderboard
- [ ] Note the winner's name, email and phone for the handover
- [ ] Identify second and third place using the same rule
- [ ] Screenshot the final leaderboard
- [ ] Export **all four** CSVs from Admin → Export and save them safely
- [ ] Announce and hand over the prizes
- [ ] Confirm the marketing team knows to contact only `marketing_opt_in = true` people

---

## Escalation

| Situation | Who to call |
| --- | --- |
| Booth or process question | Booth lead |
| App error with a reference code | Technical owner — quote the code |
| Prize dispute | Booth lead, with the audit log open (Admin → Export) |
| Data or privacy question from a visitor | Booth lead — the privacy notice is at `/privacy` |
