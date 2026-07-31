import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * E2E runs against DEMO_MODE so it never needs a real Supabase project or real participant data.
 * The demo store resets per server boot, which keeps the suite deterministic.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7) landscape'] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      DEMO_MODE: '1',
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: BASE_URL,
      ADMIN_USERNAME: 'e2e-admin',
      ADMIN_PASSWORD: 'e2e-admin-password',
      ADMIN_SESSION_SECRET: 'e2e-admin-session-secret-value-at-least-32-chars',
      ATTEMPT_SIGNING_SECRET: 'e2e-attempt-signing-secret-value-at-least-32-chars',
      IP_HASH_SECRET: 'e2e-ip-hash-secret-value-that-is-at-least-32-chars',
      EVENT_TIMEZONE: 'Asia/Kolkata',
    },
  },
});
