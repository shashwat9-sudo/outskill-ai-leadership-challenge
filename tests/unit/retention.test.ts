import { beforeEach, describe, expect, it } from 'vitest';
import { DemoStore, resetDemoStore } from '@/lib/database/demo-store';
import { ANONYMISED_NAME, ANONYMISE_CONFIRMATION, RETENTION_DAYS } from '@/lib/config/constants';
import { anonymiseSchema } from '@/lib/validation/schemas';
import { normaliseEmail } from '@/lib/utils/identity';
import { buildPublicName } from '@/lib/utils/identity';

/**
 * Seven-day retention.
 *
 * The contract this protects: anonymisation removes the person, keeps the statistics, and can never
 * be triggered by anything other than a deliberate two-step admin action.
 */

let store: DemoStore;

async function addParticipant(index: number) {
  const email = `retention.${index}@example.invalid`;
  return store.registerParticipant({
    full_name: `Retention Tester ${index}`,
    email,
    email_normalized: normaliseEmail(email),
    phone_original: `96000000${String(index).padStart(2, '0')}`,
    phone_e164: `+9196000000${String(index).padStart(2, '0')}`,
    company_name: `Retention Corp ${index}`,
    designation: 'Head of People',
    public_leaderboard_opt_in: true,
    marketing_opt_in: true,
  });
}

beforeEach(async () => {
  resetDemoStore();
  store = new DemoStore();
});

describe('the retention configuration', () => {
  it('keeps participant data for seven days', () => {
    expect(RETENTION_DAYS).toBe(7);
  });
});

describe('the anonymisation confirmation', () => {
  it('requires both a password and a typed phrase', () => {
    expect(anonymiseSchema.safeParse({ password: 'pw', confirmation: ANONYMISE_CONFIRMATION }).success).toBe(true);
    expect(anonymiseSchema.safeParse({ password: '', confirmation: ANONYMISE_CONFIRMATION }).success).toBe(false);
    expect(anonymiseSchema.safeParse({ password: 'pw', confirmation: '' }).success).toBe(false);
    expect(anonymiseSchema.safeParse({ password: 'pw' }).success).toBe(false);
  });
});

describe('anonymising participant data', () => {
  it('removes every name, email address and phone number', async () => {
    await addParticipant(1);
    await addParticipant(2);

    const result = await store.anonymiseParticipants();
    expect(result.anonymised).toBeGreaterThanOrEqual(2);

    const rows = await store.exportParticipants();
    for (const row of rows) {
      expect(row.full_name).toBe(ANONYMISED_NAME);
      expect(row.email).not.toContain('retention.');
      expect(row.email).toMatch(/@invalid$/);
      expect(row.phone_original).toBe('');
      expect(row.phone_e164).not.toContain('9600000');
    }
  });

  it('keeps the placeholder email and phone unique, so the database constraints still hold', async () => {
    for (let index = 1; index <= 5; index += 1) await addParticipant(index);
    await store.anonymiseParticipants();

    const rows = await store.exportParticipants();
    expect(new Set(rows.map((row) => row.email_normalized)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.phone_e164)).size).toBe(rows.length);
  });

  it('produces a phone placeholder that still satisfies the E.164 format check', async () => {
    await addParticipant(1);
    await store.anonymiseParticipants();

    for (const row of await store.exportParticipants()) {
      expect(row.phone_e164).toMatch(/^\+[1-9][0-9]{6,14}$/);
    }
  });

  it('clears consent flags, since they no longer describe a contactable person', async () => {
    await addParticipant(1);
    await store.anonymiseParticipants();

    for (const row of await store.exportParticipants()) {
      expect(row.marketing_opt_in).toBe(false);
      expect(row.public_leaderboard_opt_in).toBe(false);
    }
  });

  it('preserves scores, times and ranking so aggregate reporting still works', async () => {
    const before = await store.getLeaderboard(100);
    expect(before.length).toBeGreaterThan(0);

    await store.anonymiseParticipants();
    const after = await store.getLeaderboard(100);

    expect(after).toHaveLength(before.length);
    expect(after.map((row) => row.correct_count)).toEqual(before.map((row) => row.correct_count));
    expect(after.map((row) => row.elapsed_ms)).toEqual(before.map((row) => row.elapsed_ms));
    expect(after.map((row) => row.rank)).toEqual(before.map((row) => row.rank));
  });

  it('leaves no identifiable name on the public leaderboard afterwards', async () => {
    await store.anonymiseParticipants();

    for (const row of await store.getLeaderboard(100)) {
      const display = buildPublicName(row.full_name, row.public_leaderboard_opt_in, row.public_number);
      expect(display).toMatch(/^Anonymous Leader/);
    }
  });

  it('is idempotent: running it twice changes nothing the second time', async () => {
    await addParticipant(1);

    const first = await store.anonymiseParticipants();
    const second = await store.anonymiseParticipants();

    expect(first.anonymised).toBeGreaterThan(0);
    expect(second.anonymised).toBe(0);
    expect(second.alreadyAnonymised).toBe(first.anonymised + first.alreadyAnonymised);
  });

  it('reports progress accurately before and after', async () => {
    await addParticipant(1);

    const before = await store.countAnonymisedParticipants();
    expect(before.anonymised).toBe(0);
    expect(before.total).toBeGreaterThan(0);

    await store.anonymiseParticipants();

    const after = await store.countAnonymisedParticipants();
    expect(after.anonymised).toBe(after.total);
  });

  it('deletes nobody — the rows and their attempts remain', async () => {
    const before = await store.countAnonymisedParticipants();
    const attemptsBefore = (await store.exportAttempts()).length;

    await store.anonymiseParticipants();

    const after = await store.countAnonymisedParticipants();
    expect(after.total).toBe(before.total);
    expect((await store.exportAttempts()).length).toBe(attemptsBefore);
  });
});
