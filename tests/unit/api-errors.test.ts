import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression guards for the stale/misleading admin error banner.
 *
 * Two defects combined to show "We could not reach the challenge database" while Supabase was
 * perfectly healthy:
 *
 *   1. `fail()` classified every Postgres error that was not a not-found or a unique violation as
 *      'unavailable', so a rejected action — verifying an attempt that was never submitted,
 *      disqualifying one that was already invalidated — was reported as a connectivity outage.
 *   2. `unexpectedFailure` used `instanceof StoreError`, which is false when Next.js loads the store
 *      module in more than one route bundle, demoting every StoreError to an unexpected 500.
 *
 * Both are pure classification logic, so both are testable without a database.
 */

const rpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc, from: () => ({}) }),
}));

vi.mock('@/lib/config/env', () => ({
  getSupabaseUrl: () => 'https://example-project.supabase.co',
  getSupabaseSecretKey: () => 'mocked-key-unused-by-the-stubbed-client',
  isDemoMode: () => false,
  // respond.ts imports this for its own type check, so the stub has to provide it too.
  MissingEnvError: class MissingEnvError extends Error {
    readonly variable: string;
    constructor(variable: string, hint: string) {
      super(`Missing or invalid environment variable ${variable}. ${hint}`);
      this.name = 'MissingEnvError';
      this.variable = variable;
    }
  },
}));

const { SupabaseStore } = await import('@/lib/database/supabase-store');
const { unexpectedFailure } = await import('@/lib/api/respond');
type StoreErrorShape = Error & { code: string };

const INPUT = {
  full_name: 'Ananya Sharma',
  email: 'ananya@example.invalid',
  email_normalized: 'ananya@example.invalid',
  phone_original: '9876543210',
  phone_e164: '+919876543210',
  company_name: 'Northwind Analytics',
  designation: 'Head of People',
  public_leaderboard_opt_in: true,
  marketing_opt_in: false,
};

async function codeFor(pgCode: string, message = 'boom'): Promise<string> {
  rpc.mockResolvedValue({ data: null, error: { message, code: pgCode } });
  try {
    await new SupabaseStore().registerParticipant(INPUT);
  } catch (error) {
    return (error as StoreErrorShape).code;
  }
  throw new Error('expected the store to throw');
}

describe('Postgres error classification', () => {
  beforeEach(() => rpc.mockReset());

  it('treats a check-constraint violation as a rejected action, not an outage', async () => {
    // 23514 is what a disqualify or verify against an ineligible row produces.
    expect(await codeFor('23514')).toBe('invalid_state');
  });

  it('does not describe a check violation as a database connectivity problem', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'violates check constraint "attempts_invalidated_consistent"' },
    });
    await expect(new SupabaseStore().registerParticipant(INPUT)).rejects.toThrow(
      /cannot be applied to this entry/i,
    );
    await expect(new SupabaseStore().registerParticipant(INPUT)).rejects.not.toThrow(/reach the challenge database/i);
  });

  it('still reports a genuine database failure as unavailable', async () => {
    // A real outage has no constraint code at all — that must keep reaching the connectivity path.
    expect(await codeFor('08006', 'connection failure')).toBe('unavailable');
    expect(await codeFor('', 'socket hang up')).toBe('unavailable');
  });

  it('keeps the existing not-found and duplicate classifications unchanged', async () => {
    expect(await codeFor('P0002')).toBe('not_found');
    expect(await codeFor('PGRST116')).toBe('not_found');
    expect(await codeFor('23505')).toBe('conflict');
  });
});

describe('unexpectedFailure', () => {
  /** A StoreError from a second copy of the module — what a split route bundle produces. */
  class ForeignStoreError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'StoreError';
      this.code = code;
    }
  }

  it('recognises a StoreError that came from a different module instance', async () => {
    const response = unexpectedFailure(new ForeignStoreError('invalid_state', 'Not allowed here.'), 'test');
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('store_invalid_state');
    expect(body.error.message).toBe('Not allowed here.');
  });

  it('surfaces the connectivity message only for a genuine unavailable error', async () => {
    const response = unexpectedFailure(new ForeignStoreError('unavailable', 'Read settings: timeout'), 'test');
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.message).toMatch(/could not reach the challenge database/i);
  });

  it('maps a not-found store error to 404', async () => {
    const response = unexpectedFailure(new ForeignStoreError('not_found', 'Gone.'), 'test');
    expect(response.status).toBe(404);
  });

  it('still reports a genuinely unknown error as an unexpected failure', async () => {
    const response = unexpectedFailure(new Error('something else entirely'), 'test');
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('unexpected_error');
    // The internal detail must never reach the browser.
    expect(body.error.message).not.toContain('something else entirely');
  });

  it('never leaks a raw database message to the browser on an outage', async () => {
    const response = unexpectedFailure(
      new ForeignStoreError('unavailable', 'Disqualify attempt: relation "attempts" does not exist'),
      'test',
    );
    const body = await response.json();
    expect(body.error.message).not.toContain('relation "attempts"');
  });
});
