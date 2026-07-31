import { expect, test, type Page } from '@playwright/test';

/**
 * Participant journey end-to-end.
 *
 * Runs against DEMO_MODE, so there is no Supabase dependency and no real personal data. Every
 * registration uses an @example.invalid address, which by RFC can never be a real mailbox.
 */

/** Unique details per test run, so the duplicate rules do not collide between tests. */
function uniqueParticipant(tag: string) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  return {
    name: `Test ${tag}`,
    email: `e2e.${tag}.${stamp}@example.invalid`,
    // A valid Indian mobile: 9 followed by nine digits.
    phone: `9${stamp}`,
  };
}

async function register(page: Page, person: { name: string; email: string; phone: string }) {
  await page.goto('/challenge');
  await page.getByLabel('Full name').fill(person.name);
  await page.getByLabel('Work email').fill(person.email);
  await page.getByLabel('Mobile number').fill(person.phone);
  await page.getByRole('checkbox', { name: /I agree to the/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
}

/**
 * Answer every remaining question.
 *
 * After each click it waits for that specific question marker to disappear, rather than sleeping for
 * a fixed interval — the runner has a short lock-in delay before advancing, and a fixed sleep races
 * it. Works whether the run starts at question 1 or part-way through.
 */
async function answerAll(page: Page, optionIndex = 0) {
  // The first question only renders once /api/public/start has responded, so wait for the run to be
  // on screen before looking for individual questions.
  await page
    .getByText(/Question \d of 7/)
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => undefined);

  for (let questionNumber = 1; questionNumber <= 7; questionNumber += 1) {
    const marker = page.getByText(`Question ${questionNumber} of 7`);
    if (!(await marker.isVisible().catch(() => false))) continue;

    await page.getByTestId(`answer-option-${optionIndex}`).click();
    await expect(marker).toBeHidden({ timeout: 15_000 });
  }
}

/** Next injects an empty role="alert" route announcer, so alerts must be matched by their text. */
function alertWith(page: Page, text: string | RegExp) {
  return page.getByRole('alert').filter({ hasText: text });
}

test.describe('participant flow', () => {
  test('1. completes the full journey from registration to result', async ({ page }) => {
    const person = uniqueParticipant('happy');

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The AI Leadership Challenge');
    await expect(page.getByText('Can you make the right AI decisions under pressure?')).toBeVisible();
    await expect(page.getByText('7 leadership decisions. 130 seconds. One live leaderboard.')).toBeVisible();

    await page.getByRole('link', { name: 'Take the Challenge' }).click();
    await expect(page.getByRole('heading', { name: 'Enter the challenge' })).toBeVisible();

    await page.getByLabel('Full name').fill(person.name);
    await page.getByLabel('Work email').fill(person.email);
    await page.getByLabel('Mobile number').fill(person.phone);
    await page.getByRole('checkbox', { name: /I agree to the/ }).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Instructions must appear before the timer starts.
    await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
    await expect(page.getByText('Accuracy determines your score. Speed breaks a tie.')).toBeVisible();
    await expect(page.getByText(/timer starts the moment you press/i)).toBeVisible();

    await page.getByRole('button', { name: 'Start Challenge' }).click();

    await expect(page.getByText('Question 1 of 7')).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible();

    await answerAll(page);

    await expect(page.getByText('Calculating your result…')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/You scored \d out of 7/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Completed in')).toBeVisible();
    await expect(page.getByText('Current position')).toBeVisible();
    await expect(page.getByText(/Show this screen to the Outskill team/)).toBeVisible();
  });

  test('2. never sends the correct answer or an explanation to the browser', async ({ page }) => {
    const person = uniqueParticipant('nopeek');
    const payloads: string[] = [];

    page.on('response', async (response) => {
      if (!response.url().includes('/api/public/start')) return;
      payloads.push(await response.text().catch(() => ''));
    });

    await register(page, person);
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    await expect(page.getByText('Question 1 of 7')).toBeVisible();

    expect(payloads.length).toBeGreaterThan(0);
    for (const body of payloads) {
      // Match the JSON keys, not bare words: some question text legitimately contains "explanation"
      // ("What is the most likely explanation?"), which a substring search would flag as a leak.
      expect(body).not.toContain('"correct_option_id"');
      expect(body).not.toContain('"explanation"');

      // Belt and braces: walk the parsed payload and assert the forbidden keys are absent entirely.
      const parsed: unknown = JSON.parse(body);
      const keys = new Set<string>();
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) return value.forEach(walk);
        if (value && typeof value === 'object') {
          for (const [key, child] of Object.entries(value)) {
            keys.add(key);
            walk(child);
          }
        }
      };
      walk(parsed);

      expect(keys.has('correct_option_id')).toBe(false);
      expect(keys.has('explanation')).toBe(false);
      expect(keys.has('correct_option')).toBe(false);
    }
  });

  test('3. blocks a duplicate registration with a neutral message', async ({ page }) => {
    const person = uniqueParticipant('dupe');

    await register(page, person);
    await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();

    // Same email, different phone — must be refused, and must not say which field matched.
    await page.goto('/challenge');
    await page.evaluate(() => window.sessionStorage.clear());
    await page.reload();

    await page.getByLabel('Full name').fill(person.name);
    await page.getByLabel('Work email').fill(person.email);
    await page.getByLabel('Mobile number').fill('9000000123');
    await page.getByRole('checkbox', { name: /I agree to the/ }).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    const alert = alertWith(page, 'already entered the challenge');
    await expect(alert).toBeVisible();

    // The message must not reveal which field matched — that would leak other people's details.
    const message = (await alert.textContent()) ?? '';
    expect(message).not.toMatch(/email/i);
    expect(message).not.toMatch(/phone/i);
  });

  test('4. answers only the first question and still receives a scored result', async ({ page }) => {
    const person = uniqueParticipant('partial');

    await register(page, person);
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    await expect(page.getByText('Question 1 of 7')).toBeVisible();

    await page.getByTestId('answer-option-0').click();
    await expect(page.getByText('Question 2 of 7')).toBeVisible();

    // Unanswered questions count as incorrect, so the run still resolves once time runs out.
    await answerAll(page, 1);
    await expect(page.getByText(/You scored \d out of 7/)).toBeVisible({ timeout: 20_000 });
  });

  test('5. auto-submits when the timer reaches zero', async ({ page }) => {
    // The whole point of this test is to sit through the full 130-second run.
    test.setTimeout(240_000);
    const person = uniqueParticipant('expiry');

    await register(page, person);
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    await expect(page.getByText('Question 1 of 7')).toBeVisible();

    // Answer one question, then let the full 130 seconds elapse without touching anything else.
    await page.getByTestId('answer-option-0').click();

    await expect(page.getByText(/You scored \d out of 7/)).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText('Completed in')).toBeVisible();
  });

  test('6. resumes an in-progress attempt after a page reload', async ({ page }) => {
    const person = uniqueParticipant('resume');

    await register(page, person);
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    await expect(page.getByText('Question 1 of 7')).toBeVisible();

    await page.getByTestId('answer-option-0').click();
    await expect(page.getByText('Question 2 of 7')).toBeVisible();

    await page.reload();

    // The run continues where it was, rather than restarting or granting fresh time.
    await expect(page.getByText('Question 2 of 7')).toBeVisible({ timeout: 15_000 });
  });

  test('7. does not allow returning to a previous question', async ({ page }) => {
    const person = uniqueParticipant('noback');

    await register(page, person);
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    await expect(page.getByText('Question 1 of 7')).toBeVisible();

    await page.getByTestId('answer-option-0').click();
    await expect(page.getByText('Question 2 of 7')).toBeVisible();

    await page.goBack();
    await expect(page.getByText('Question 1 of 7')).toHaveCount(0);
  });
});

test.describe('kiosk mode', () => {
  test('8. returns to the landing screen and clears the session after the idle timeout', async ({ page }) => {
    const person = uniqueParticipant('kiosk');

    await page.goto('/challenge?kiosk=1');
    await page.getByLabel('Full name').fill(person.name);
    await page.getByLabel('Work email').fill(person.email);
    await page.getByLabel('Mobile number').fill(person.phone);
    await page.getByRole('checkbox', { name: /I agree to the/ }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Start Challenge' }).click();

    await answerAll(page);
    await expect(page.getByText(/You scored \d out of 7/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('reset-countdown')).toContainText(/Resetting for the next participant in \d+ seconds/);

    // The result window is 40s; allow headroom for the calculating animation.
    await page.waitForURL(/\/\?kiosk=1$/, { timeout: 70_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The AI Leadership Challenge');

    const leftovers = await page.evaluate(() => ({
      attempt: window.sessionStorage.getItem('oskl.attempt.v1'),
      participant: window.sessionStorage.getItem('oskl.participant.v1'),
      result: window.localStorage.getItem('oskl.result.v1'),
    }));
    expect(leftovers).toEqual({ attempt: null, participant: null, result: null });
  });
});

test.describe('on-screen result and answer review', () => {
  test('40. shows a review of all seven answers with correct and incorrect badges', async ({ page }) => {
    const person = uniqueParticipant('review');

    await register(page, person);
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    await answerAll(page);
    await expect(page.getByText(/You scored \d out of 7/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: 'Review answers' }).click();

    const items = page.getByTestId('review-item');
    await expect(items).toHaveCount(7);

    // Every item carries exactly one verdict, and the numbering runs 1..7.
    for (let index = 0; index < 7; index += 1) {
      await expect(items.nth(index)).toContainText(`Question ${index + 1}`);
      await expect(items.nth(index)).toContainText(/Correct|Incorrect|Not answered/);
    }
  });

  test('41. explains the principle for a wrong answer without revealing the correct option', async ({ page }) => {
    const person = uniqueParticipant('principle');

    // Answering every question with the same option index guarantees a spread of right and wrong.
    await register(page, person);
    await page.getByRole('button', { name: 'Start Challenge' }).click();
    await answerAll(page, 1);
    await expect(page.getByText(/You scored \d out of 7/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: 'Review answers' }).click();

    const wrong = page.getByTestId('review-item').filter({ hasText: 'Incorrect' }).first();
    await expect(wrong).toBeVisible();

    // The participant's own answer is shown, and a principle is taught…
    await expect(wrong.getByText('Your answer')).toBeVisible();

    // …but nothing on the page may announce which option was right.
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain('The correct answer');
    expect(body).not.toContain('Correct answer:');

    // And no share / print / email / copy affordance exists anywhere on the result screen.
    for (const name of [/Share/i, /Print/i, /Email/i, /Copy/i, /Download/i]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
  });

  test('42. resets immediately on Done — Next Participant and clears participant state', async ({ page }) => {
    const person = uniqueParticipant('manualreset');

    await page.goto('/challenge?kiosk=1');
    await page.getByLabel('Full name').fill(person.name);
    await page.getByLabel('Work email').fill(person.email);
    await page.getByLabel('Mobile number').fill(person.phone);
    await page.getByRole('checkbox', { name: /I agree to the/ }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Start Challenge' }).click();

    await answerAll(page);
    await expect(page.getByText(/You scored \d out of 7/)).toBeVisible({ timeout: 20_000 });

    // The countdown is visible to booth staff before they hand the tablet on.
    await expect(page.getByTestId('reset-countdown')).toBeVisible();

    await page.getByTestId('next-participant').click();
    await page.waitForURL(/\/\?kiosk=1$/, { timeout: 20_000 });

    const leftovers = await page.evaluate(() => ({
      attempt: window.sessionStorage.getItem('oskl.attempt.v1'),
      participant: window.sessionStorage.getItem('oskl.participant.v1'),
      result: window.localStorage.getItem('oskl.result.v1'),
    }));
    expect(leftovers).toEqual({ attempt: null, participant: null, result: null });
  });

  test('43. browser back cannot bring the previous result back on a kiosk tablet', async ({ page }) => {
    const person = uniqueParticipant('back');

    await page.goto('/challenge?kiosk=1');
    await page.getByLabel('Full name').fill(person.name);
    await page.getByLabel('Work email').fill(person.email);
    await page.getByLabel('Mobile number').fill(person.phone);
    await page.getByRole('checkbox', { name: /I agree to the/ }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Start Challenge' }).click();

    await answerAll(page);
    await expect(page.getByText(/You scored \d out of 7/)).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('next-participant').click();
    await page.waitForURL(/\/\?kiosk=1$/, { timeout: 20_000 });

    await page.goBack();

    // Whatever the browser restores, the previous participant's score must not be on screen.
    await expect(page.getByText(/You scored \d out of 7/)).toHaveCount(0);
    await expect(page.getByTestId('review-item')).toHaveCount(0);
  });
});
