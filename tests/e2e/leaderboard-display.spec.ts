import { expect, test } from '@playwright/test';

/** Public leaderboard, LED display and QR poster. All read-only, all against demo data. */

test.describe('public leaderboard', () => {
  test('9. renders ranked entries with scores and times', async ({ page }) => {
    await page.goto('/leaderboard');

    await expect(page.getByRole('heading', { name: 'Live Leaderboard' })).toBeVisible();

    const board = page.getByRole('list', { name: 'Live leaderboard' });
    await expect(board).toBeVisible({ timeout: 15_000 });

    const rows = board.getByRole('listitem');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);

    // Score format "n/7" and a one-decimal time.
    await expect(rows.first()).toContainText(/\d\/\d/);
    await expect(rows.first()).toContainText(/\d+\.\d+s/);
  });

  test('10. shows opted-in names masked and opted-out entries as anonymous', async ({ page }) => {
    await page.goto('/leaderboard');
    const board = page.getByRole('list', { name: 'Live leaderboard' });
    await expect(board).toBeVisible({ timeout: 15_000 });

    const text = (await board.textContent()) ?? '';

    // The demo bank mixes opted-in and opted-out participants, so both forms must appear.
    expect(text).toMatch(/[A-Z][a-z]+ [A-Z]\./);
    expect(text).toContain('Anonymous Leader');

    // Full surnames from the demo data must never be rendered.
    for (const surname of ['Sharma', 'Menon', 'Iyer', 'Qureshi', 'Nair']) {
      expect(text).not.toContain(surname);
    }
    // Nor any contact detail.
    expect(text).not.toContain('@');
    expect(text).not.toContain('+91');
  });

  test('11. shows a verification state on every ranked row', async ({ page }) => {
    await page.goto('/leaderboard');
    const board = page.getByRole('list', { name: 'Live leaderboard' });
    await expect(board).toBeVisible({ timeout: 15_000 });

    // Asserting that both states happen to appear in the top five would depend on how many entries
    // earlier tests verified. What matters to the requirement is that every visible row states its
    // verification status, and that the board never shows more than the configured top five.
    const rows = board.getByRole('listitem');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(5);

    for (let index = 0; index < count; index += 1) {
      await expect(rows.nth(index)).toContainText(/Verified|Pending verification/);
    }
  });

  test('12. shows the event statistics', async ({ page }) => {
    await page.goto('/leaderboard');

    await expect(page.getByText('Total challengers')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Average score')).toBeVisible();
    await expect(page.getByText('Best score')).toBeVisible();
    await expect(page.getByText('Fastest perfect')).toBeVisible();
    await expect(page.getByText('Winner announced at the end of Day 2')).toBeVisible();
  });

  test('13. the public leaderboard API returns no personal data', async ({ request }) => {
    const response = await request.get('/api/public/leaderboard');
    expect(response.ok()).toBe(true);

    const body = await response.text();
    expect(body).not.toContain('@example.invalid');
    expect(body).not.toContain('phone');
    expect(body).not.toContain('full_name');
    expect(body).not.toContain('participant_id');
    expect(body).not.toContain('marketing');
  });
});

test.describe('LED display', () => {
  test('14. renders at 1920x1080 and rotates through its three scenes', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/display');

    await expect(page.getByRole('heading', { name: 'Live Top 5' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
    await expect(page.getByTestId('display-connection')).toBeVisible();

    // Scenes rotate roughly every 11 seconds; two rotations reach the brand scene.
    await expect(page.getByRole('heading', { name: 'Event pulse' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /The AI Leadership Challenge/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('14b. shows no more than five ranked entries and never a QR code', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/display');
    await expect(page.getByRole('heading', { name: 'Live Top 5' })).toBeVisible({ timeout: 15_000 });

    expect(await page.getByRole('listitem').count()).toBeLessThanOrEqual(5);

    // Participation is on the booth tablets only, so no scan prompt appears in the rotation.
    const text = (await page.locator('body').innerText()) ?? '';
    expect(text).not.toContain('Scan');
  });

  test('15. the display page never renders a full participant name', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/display');
    await expect(page.getByRole('heading', { name: 'Live Top 5' })).toBeVisible({ timeout: 15_000 });

    const text = (await page.locator('body').textContent()) ?? '';
    for (const surname of ['Sharma', 'Menon', 'Iyer']) {
      expect(text).not.toContain(surname);
    }
  });
});

test.describe('supporting pages', () => {
  test('16. the QR poster points at the participant landing page, not the admin area', async ({ page }) => {
    await page.goto('/qr');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();

    // Read the printed sheet's visible text only. `body.textContent()` would also pull in Next's
    // inlined RSC payload scripts, which legitimately mention the /admin/settings back-link.
    const sheet = (await page.locator('.print-sheet').innerText()) ?? '';
    expect(sheet).not.toContain('/admin');
    expect(sheet).toContain('Scan to take the challenge');
  });

  test('17. the rules and privacy pages render', async ({ page }) => {
    await page.goto('/rules');
    await expect(page.getByRole('heading', { name: /Challenge & prize rules/ })).toBeVisible();
    await expect(page.getByText('iPad + Custom AI Session + Hamper')).toBeVisible();

    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What we collect' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What we do not collect' })).toBeVisible();
  });

  test('18. an unknown route renders the 404 page', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('That page does not exist')).toBeVisible();
  });
});
