import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Admin authentication, verification, and the pause / lock controls. */

const ADMIN_USERNAME = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-password';

/**
 * Next injects an empty `role="alert"` route announcer into every page, so `getByRole('alert')`
 * always matches at least two nodes. This narrows to the one carrying real text.
 */
function alertWith(page: Page, text: string | RegExp) {
  return page.getByRole('alert').filter({ hasText: text });
}

/**
 * Download a CSV through the browser rather than through Playwright's API request context.
 *
 * The admin cookie is `Secure`, which is correct for production. Chromium honours it on 127.0.0.1
 * (a trustworthy origin) for real navigations, but Playwright's APIRequestContext applies the plain
 * Secure rule and drops it over http. Driving a real click is both closer to what booth staff do and
 * unaffected by that difference.
 */
async function downloadCsv(page: Page, index: number): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /Download CSV/ }).nth(index).click(),
  ]);
  return readFileSync(await download.path(), 'utf8');
}

async function signIn(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Admin username').fill(ADMIN_USERNAME);
  await page.getByLabel('Admin password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });
}

/** Leave the event active regardless of how a test finished, so later tests are not affected. */
async function restoreActiveState(page: Page) {
  await page.goto('/admin/dashboard');
  const start = page.getByRole('button', { name: 'Start' });
  if (await start.isEnabled().catch(() => false)) {
    await start.click();
    await expect(page.getByText('Active — accepting entries')).toBeVisible({ timeout: 15_000 });
  }
}

test.describe('admin authentication', () => {
  test('19. redirects an unauthenticated visitor away from the dashboard', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForURL(/\/admin(\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('20. refuses a wrong password without revealing anything', async ({ page }) => {
    await page.goto('/admin');
    await page.getByLabel('Admin username').fill(ADMIN_USERNAME);
    await page.getByLabel('Admin password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(alertWith(page, 'That username or password is not correct.')).toBeVisible();
    await expect(page).toHaveURL(/\/admin(\?|$)/);
  });

  test('20b. refuses a wrong username with the same message as a wrong password', async ({ page }) => {
    // Identical wording for both fields: nothing about the real credentials can be inferred.
    await page.goto('/admin');
    await page.getByLabel('Admin username').fill('not-the-admin');
    await page.getByLabel('Admin password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(alertWith(page, 'That username or password is not correct.')).toBeVisible();
    await expect(page).toHaveURL(/\/admin(\?|$)/);
  });

  test('21. rejects an unauthenticated admin API call', async ({ request }) => {
    const response = await request.get('/api/admin/dashboard');
    expect(response.status()).toBe(401);
  });

  test('22. signs in and reaches the dashboard', async ({ page }) => {
    await signIn(page);

    await expect(page.getByRole('heading', { name: 'Event dashboard' })).toBeVisible();
    await expect(page.getByText('Registrations')).toBeVisible();
    await expect(page.getByText('Completed attempts')).toBeVisible();
    await expect(page.getByText('Perfect scores')).toBeVisible();
    await expect(page.getByText('Challenge status')).toBeVisible();
  });

  test('23. signs out and loses access again', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/admin(\?|$)/, { timeout: 15_000 });

    await page.goto('/admin/participants');
    await page.waitForURL(/\/admin(\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('admin verification', () => {
  test('24. verifies a top-10 entry and the badge changes', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/leaderboard');

    await expect(page.getByRole('heading', { name: 'Leaderboard & verification' })).toBeVisible();

    const verifyButton = page.getByRole('button', { name: 'Verify', exact: true }).first();
    await expect(verifyButton).toBeVisible({ timeout: 15_000 });

    const pendingBefore = await page.getByText('Pending', { exact: true }).count();
    await verifyButton.click();

    // One row moves from "Pending" to "Verified", so the pending count drops by one.
    await expect
      .poll(async () => page.getByText('Pending', { exact: true }).count(), { timeout: 15_000 })
      .toBe(pendingBefore - 1);
    await expect(page.getByRole('button', { name: 'Un-verify' }).first()).toBeVisible();
  });

  test('25. shows the contact details staff need to check a badge', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/leaderboard');

    const body = (await page.locator('table').textContent()) ?? '';
    expect(body).toContain('@example.invalid');
    expect(body).toContain('+91');
  });

  test('26. inspects an attempt and shows the questions served', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/leaderboard');

    await page.getByRole('button', { name: 'Inspect' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('Attempt detail')).toBeVisible();
  });

  test('27. requires a reason before disqualifying', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/leaderboard');

    await page.getByRole('button', { name: 'Disqualify' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const confirm = dialog.getByRole('button', { name: 'Confirm disqualification' });
    await expect(confirm).toBeDisabled();

    await dialog.getByRole('textbox').fill('Duplicate entry confirmed at the desk');
    await expect(confirm).toBeEnabled();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('quiz state controls', () => {
  test.afterEach(async ({ page }) => {
    await restoreActiveState(page);
  });

  test('28. pausing the challenge blocks new participants', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Paused — no new entries')).toBeVisible({ timeout: 15_000 });

    // A participant arriving now must be told clearly, not shown a broken form.
    const participantPage = await page.context().newPage();
    await participantPage.goto('/challenge');
    await expect(participantPage.getByText('The challenge is paused', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await participantPage.close();
  });

  test('29. locking requires the exact confirmation phrase', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: 'Lock' }).click();

    const confirm = page.getByRole('button', { name: 'Confirm' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeDisabled();

    const phraseInput = page.getByRole('textbox').last();
    await phraseInput.fill('lock it');
    await expect(confirm).toBeDisabled();

    await phraseInput.fill('LOCK THE CHALLENGE');
    await expect(confirm).toBeEnabled();

    await confirm.click();
    await expect(page.getByText('Locked — event closed')).toBeVisible({ timeout: 15_000 });

    // Unlocking is equally deliberate.
    await page.getByRole('button', { name: 'Start' }).click();
    const unlockConfirm = page.getByRole('button', { name: 'Confirm' });
    await expect(unlockConfirm).toBeDisabled();
    await page.getByRole('textbox').last().fill('UNLOCK THE CHALLENGE');
    await unlockConfirm.click();
    await expect(page.getByText('Active — accepting entries')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('admin management screens', () => {
  test('30. participants screen searches and offers a non-destructive reset', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/participants');

    await expect(page.getByRole('heading', { name: 'Participants' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset' }).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Reset' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('only after a genuine technical failure');
    await expect(dialog.getByRole('button', { name: 'Confirm reset' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Permanent deletion must not be offered anywhere on this screen.
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain('Delete');
  });

  test('31. questions screen lists the seeded bank and can preview a question', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/questions');

    await expect(page.getByRole('heading', { name: 'Question bank' })).toBeVisible();
    await expect(page.getByText('120 questions total')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Preview' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The admin preview marks exactly one option as correct.
    await expect(dialog.getByText('Correct', { exact: true })).toHaveCount(1);
    await expect(dialog.getByText(/randomised order and never see which one is correct/)).toBeVisible();
  });

  test('32. settings screen loads and rejects an unsupported question count', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/settings');

    await expect(page.getByRole('heading', { name: 'Event settings' })).toBeVisible();
    await expect(page.getByLabel('Quiz title')).toHaveValue(/The AI Leadership Challenge/, { timeout: 15_000 });

    await page.getByLabel('Questions per attempt').fill('4');
    await page.getByRole('button', { name: 'Save settings' }).click();

    await expect(page.getByText(/Some fields need attention|difficulty mix/)).toBeVisible({ timeout: 15_000 });
  });

  test('33. export screen exposes the CSV downloads and the audit log', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/export');

    await expect(page.getByRole('heading', { name: 'Export & audit' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Public leaderboard' })).toBeVisible();
    await expect(page.getByText('Admin audit log')).toBeVisible();
  });

  test('34. the leads CSV downloads with the expected header row', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/export');

    // First export card on the screen is the leads list.
    const body = await downloadCsv(page, 0);
    expect(body).toContain('participant_id');
    expect(body).toContain('marketing_consent');
    expect(body).toContain('completion_time_seconds');
    expect(body).toContain('registered_at_ist');
    expect(body).toContain('submitted_at_ist');
    expect(body).toContain('rank');
    // The leads export is the one file that legitimately carries contact details.
    expect(body).toContain('@example.invalid');
  });

  test('35. the public leaderboard CSV carries masked names only', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/export');

    // Third card on the export screen is the public-safe leaderboard.
    const body = await downloadCsv(page, 2);

    expect(body).toContain('display_name');
    expect(body).toContain('Anonymous Leader');
    expect(body).not.toContain('@example.invalid');
    expect(body).not.toContain('phone');
  });
});
