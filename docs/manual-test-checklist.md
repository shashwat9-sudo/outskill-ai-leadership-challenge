# Manual test checklist

Work through this against the **deployed** site with the **real Supabase database**, before the event.
The automated tests cover the logic; this covers the things only a person can confirm — that it feels
right on a real tablet, on a real phone, on the real screen.

Tick every box. Anything that fails, fix before Day 1.

Tester: ________________  Date: ____________  URL tested: ______________________________

---

## A. Setup and configuration

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] The deployed site loads over **https**
- [ ] `/admin` is **not** reachable without the password
- [ ] No "DEMO MODE" badge appears anywhere on the deployed site
- [ ] Admin → Dashboard shows no "Configuration incomplete" warning
- [ ] Admin → Dashboard shows no question-pool warning
- [ ] Admin → Questions shows **120 questions total**

## B. Question content review (do this properly — 30 minutes)

- [ ] Every one of the 120 questions read end to end
- [ ] Each reads as a realistic executive decision, not trivia
- [ ] No question depends on a fact that will date quickly
- [ ] Each has exactly one clearly strongest answer
- [ ] Distractors are plausible, not silly
- [ ] Wording matches how Outskill wants to sound to CHROs and CXOs
- [ ] Every question moved from **reviewed** to **approved**
- [ ] Preview a question: correct answer marked, note about randomised order present

## C. Registration

- [ ] The form asks for name, email, phone, **Company / Organisation** and **Designation / Job Title**
- [ ] **Designation / Job Title** is visibly marked *Optional*; the other four are not
- [ ] It does **not** ask for a postal address or a password
- [ ] Submitting with an empty company shows "Please enter your company or organisation." on that field
- [ ] Spaces-only in the company field is rejected the same way
- [ ] Submitting with the designation **left blank succeeds** and reaches the instructions screen
- [ ] A one-character designation shows "Please enter at least two characters, or leave this blank."
- [ ] On a booth tablet the form scrolls vertically only — no horizontal scrolling at any width
- [ ] Both opt-in checkboxes are **unticked** by default
- [ ] The rules acknowledgement is required — submitting without it shows an error
- [ ] "challenge rules" and "privacy notice" links open the right pages
- [ ] An invalid email shows a clear message on the email field
- [ ] An invalid phone shows a clear message on the phone field
- [ ] A too-short name shows a clear message
- [ ] India is preselected in the country dropdown
- [ ] An international number works (try a +971 or +44 number)
- [ ] Registering does **not** start the timer

## D. Duplicate protection

- [ ] Register once with a test identity — succeeds
- [ ] Register again, **same email, different phone** — refused
- [ ] Register again, **same phone, different email** — refused
- [ ] Register with the same email in **different case** — refused
- [ ] Register with the same phone written differently (`98765 43210` vs `+91 98765 43210`) — refused
- [ ] The refusal message never mentions "email" or "phone"
- [ ] The refusal message reads: *"It looks like you have already entered the challenge. Please speak
      to the Outskill team if you experienced a technical issue."*

## E. Instructions screen

- [ ] Says "Answer 7 workplace AI decisions in 130 seconds"
- [ ] Says "Accuracy determines your score. Speed breaks a tie."
- [ ] Says you cannot return to a previous question
- [ ] The primary button reads **Start Challenge**
- [ ] The timer has not started yet

## F. The timed challenge

- [ ] Exactly **7** questions
- [ ] Countdown starts at **60** seconds
- [ ] "Question X of 7" is visible throughout
- [ ] The progress bar advances
- [ ] Exactly four answer options each time
- [ ] Answer buttons are comfortably tappable on a tablet
- [ ] Selecting an answer moves forward automatically
- [ ] There is no way back to a previous question
- [ ] Double-tapping an answer does not skip a question or register twice
- [ ] The challenge does **not** show whether an answer was right
- [ ] The countdown visibly escalates in the final 10 seconds
- [ ] Answering the 7th question submits immediately
- [ ] Letting the clock run out submits automatically
- [ ] Unanswered questions count as incorrect

## G. Fairness and integrity

- [ ] Take the challenge five times with different test identities
- [ ] Each time, the questions differ
- [ ] Each time, the option order differs
- [ ] Open the browser's developer tools → Network → the `start` response.
      Confirm it contains **no** `correct_option_id` and **no** `explanation`
- [ ] In Admin → Leaderboard → Inspect, the questions shown match what the participant saw
- [ ] Across several runs, no obvious difficulty imbalance between participants

## H. Results

- [ ] "Calculating your result…" appears briefly
- [ ] Shows "You scored X out of 7"
- [ ] Shows "Completed in XX.Xs"
- [ ] Shows "Current position: #X"
- [ ] A top-5 result shows the "You're in the Top 5" message and the verification prompt
- [ ] Verification status shows as **Pending verification**
- [ ] "Show this screen to the Outskill team." is shown
- [ ] The **Review answers** tab lists all 7 questions with Correct / Incorrect / Not answered
- [ ] A wrong answer shows the participant's own choice and a principle, but never names the right option
- [ ] There is no share, print, email, copy or download control anywhere on the result screen
- [ ] "View Live Leaderboard" works
- [ ] The result does **not** show correct answers, explanations, or anyone else's details

## I. Kiosk mode (on a real tablet)

- [ ] Open `/challenge?kiosk=1`
- [ ] Complete a challenge
- [ ] A visible countdown reads "Resetting for the next participant in NN seconds"
- [ ] After 40 seconds the tablet returns to the landing screen on its own
- [ ] The countdown keeps running while you switch between "Your score" and "Review answers"
- [ ] Tapping **Done — Next Participant** resets immediately, without waiting
- [ ] After a reset, the browser back gesture does not bring the previous result back
- [ ] After it resets, starting again shows a **blank** registration form — no previous name or email
- [ ] On a personal phone (no `?kiosk=1`), the result stays on screen and survives a refresh

## J. Network reliability (on a real tablet)

- [ ] Start a challenge, then turn Wi-Fi off mid-run
- [ ] An offline warning appears
- [ ] The timer keeps counting and answers can still be selected
- [ ] Finish the run — it shows "Waiting for the connection to return…"
- [ ] Turn Wi-Fi back on — it submits by itself and shows the result
- [ ] Repeat, but leave it offline long enough to fail — a **Try submitting again** button appears
- [ ] Reload mid-challenge — the run resumes at the same question with the correct time remaining
- [ ] Confirm in Admin → Leaderboard that only **one** attempt exists for that person

## K. Public leaderboard

- [ ] Shows rank, name, score and time
- [ ] Opted-in names show as "Firstname S." — never a full surname
- [ ] Opted-out entries show as "Anonymous Leader NNN"
- [ ] Two anonymous entries have different numbers
- [ ] No email address appears anywhere
- [ ] No phone number appears anywhere
- [ ] Verified entries show a **Verified** badge
- [ ] Unverified entries show **Pending verification**
- [ ] Total challengers, average score, best score and fastest perfect score all shown
- [ ] Toughest pillar shown (needs at least ~10 answers in a pillar)
- [ ] "Winner announced at the end of Day 2" is shown
- [ ] It refreshes on its own within about 10 seconds of a new entry
- [ ] Ranking order is correct: higher score first, then faster time
- [ ] Two identical scores are separated by time, and the order does not flicker between refreshes

## L. LED display (on the actual screen)

- [ ] `/display` at 1920×1080 fills the screen with no scrollbars
- [ ] Text is readable from across the booth
- [ ] The **Full screen** button works
- [ ] It rotates through Top 5 → Event pulse → Call to action
- [ ] Each scene lasts roughly 10–12 seconds
- [ ] The QR code is large and crisp
- [ ] Scanning the on-screen QR opens the landing page
- [ ] Switch to another tab for a minute, come back — it has not raced ahead through scenes
- [ ] No full names, emails or phone numbers appear

## M. QR code

- [ ] `/qr` renders the poster
- [ ] Print preview is white-background and readable
- [ ] Download as SVG works
- [ ] Download as PNG works
- [ ] Scanning the printed code from ~1 metre opens the landing page
- [ ] It opens the participant page, **not** `/admin`

## N. Admin authentication

- [ ] `/admin/dashboard` redirects to the sign-in page when not signed in
- [ ] A wrong password is refused with "That password is not correct."
- [ ] The correct password signs in
- [ ] **Sign out** works, and protected pages become unreachable again
- [ ] Eight or so wrong passwords in a row triggers a rate-limit message
- [ ] After signing in, closing the browser and reopening keeps you signed in (8-hour session)

## O. Admin dashboard

- [ ] Status, registrations, completed attempts, completion rate all correct
- [ ] Average score, perfect scores, verified and pending counts all correct
- [ ] Attempts-over-time chart shows data
- [ ] Recent submissions list is populated
- [ ] Provisional winner and verified winner are both shown
- [ ] Numbers match what you see on the public leaderboard

## P. Admin leaderboard and verification

- [ ] Full name, email, phone, score, time and submitted time are all shown
- [ ] Both consent flags are shown
- [ ] Attempt ID is shown
- [ ] **Verify** works — badge changes to Verified
- [ ] **Un-verify** works
- [ ] **Disqualify** requires a reason of at least a few characters
- [ ] A disqualified entry disappears from the **public** leaderboard within one refresh
- [ ] **Restore** brings it back
- [ ] **Inspect** shows the exact questions, the participant's answers, and the correct answers
- [ ] Inspect shows the audit history for that attempt
- [ ] Search by name, email and phone all work

## Q. Admin participants

- [ ] Search by name works
- [ ] Search by email works
- [ ] Search by phone works
- [ ] Search by company works
- [ ] Search by designation works
- [ ] Search by participant ID works
- [ ] The **Company / Role** column shows company and designation
- [ ] A participant who left the designation blank shows an em dash, not "Unknown"
- [ ] A participant registered before these fields existed shows an em dash for both
- [ ] Registration date, attempt status, score, rank and consents are shown
- [ ] **Reset** requires a reason
- [ ] After a reset, the old attempt disappears from the leaderboard but still exists in the records
- [ ] After a reset, that person can take exactly one more attempt
- [ ] After a reset, a **second** reset is still possible (staff judgement) but the audit log records both
- [ ] There is no permanent-delete button anywhere

## R. Admin questions

- [ ] The table lists all questions with pillar, difficulty and status
- [ ] Search by code and by question text works
- [ ] Filters by pillar, difficulty, active and review status all work
- [ ] **Create** a new question — it appears in the list
- [ ] **Edit** a question — the change is saved
- [ ] **Duplicate** a question — a copy appears as inactive and draft
- [ ] Deactivating a question stops it being served (take several challenges to confirm)
- [ ] **Preview** shows the correct answer marked
- [ ] **CSV template** downloads
- [ ] Importing the template as a dry run reports 1 valid row
- [ ] Importing a deliberately broken CSV reports the exact row number and problem
- [ ] A broken row is **not** imported
- [ ] Committing a valid import adds the question

## S. Admin settings

- [ ] All copy fields are editable and save
- [ ] Event name, location, start, end and winner announcement all save
- [ ] Prize descriptions save and appear on the landing page and rules page
- [ ] Changing the leaderboard size changes the public leaderboard
- [ ] Changing the leaderboard refresh interval takes effect
- [ ] Setting questions per attempt to **4** is **rejected** with a clear message
- [ ] Setting quiz duration to **5** seconds is **rejected**
- [ ] Setting the event end **before** the start is **rejected**
- [ ] Privacy notice text edits appear on `/privacy`
- [ ] Rules text edits appear on `/rules`
- [ ] The privacy contact placeholder has been replaced with real wording

## T. Admin export and audit

- [ ] Leads CSV downloads and opens correctly in Excel
- [ ] Names with non-Latin characters render correctly in Excel (not as mojibake)
- [ ] `company_name` and `designation` columns are present, immediately after `phone_as_entered`
- [ ] A company containing a comma or an apostrophe stays in one cell when opened in Excel
- [ ] `marketing_opt_in` column is present and accurate
- [ ] Attempts CSV downloads
- [ ] Public leaderboard CSV downloads and contains **no** emails, phone numbers, companies or job titles
- [ ] Questions CSV downloads and can be re-imported
- [ ] The audit log shows every verify, disqualify, reset, lock and export you performed

## U. Quiz state controls

- [ ] **Pause** — a new visitor sees the paused message
- [ ] Someone already mid-challenge can still finish while paused
- [ ] **Start** — new visitors can register again
- [ ] **Lock** requires typing `LOCK THE CHALLENGE`
- [ ] While locked, registration is refused with the closing message
- [ ] While locked, starting a challenge is refused
- [ ] Unlocking requires typing `UNLOCK THE CHALLENGE`
- [ ] After unlocking, everything works again

## V. Responsive layout

- [ ] iPad **landscape** — the challenge fits with no awkward scrolling
- [ ] iPad **portrait** — the challenge fits with no awkward scrolling
- [ ] Modern iPhone — readable and tappable
- [ ] Modern Android phone — readable and tappable
- [ ] Small phone (e.g. iPhone SE) — nothing is cut off
- [ ] Desktop admin — tables are readable, wide tables scroll horizontally rather than the page
- [ ] 1920×1080 display — no scrollbars

## W. Accessibility

- [ ] The whole participant flow is completable with a keyboard alone (Tab, Enter, Space)
- [ ] Focus is clearly visible on every interactive element
- [ ] "Skip to main content" works as the first Tab
- [ ] Increase the device text size to a large accessibility setting — questions and options stay readable
- [ ] Turn on "Reduce Motion" in the OS — animations stop, nothing becomes unusable
- [ ] Colour contrast is comfortable in the booth's actual lighting

## X. Privacy and security

- [ ] `/privacy` states what is collected, why, and how to make contact
- [ ] `/privacy` explains that public names appear only on opt-in
- [ ] `/rules` states one entry per person, the ranking rules, and the verification requirement
- [ ] The public leaderboard API response contains no email, phone or full name
      (check in developer tools → Network)
- [ ] The public stats API response contains no personal data
- [ ] The server logs contain no names, emails, phone numbers or answers
- [ ] An error screen shows a friendly message and a reference code, never a database error
- [ ] `/admin` is not linked from any public page

## Y. Load and stability

- [ ] `npm run load:smoke -- --url https://your-address` reports all endpoints healthy
- [ ] Five people take the challenge simultaneously on the five tablets — all complete correctly
- [ ] The leaderboard updates correctly with all five
- [ ] Leave the LED display running for 30 minutes — it is still updating and has not frozen

---

## Sign-off

- [ ] Every box above is ticked, or the exception is written down and accepted below
- [ ] The event-day runbook has been read by everyone working the booth
- [ ] At least two people know the admin password
- [ ] Leads have been exported once as a dry run

Exceptions accepted:

```
________________________________________________________________

________________________________________________________________

________________________________________________________________
```

Signed: ______________________  Role: ______________________  Date: ____________
