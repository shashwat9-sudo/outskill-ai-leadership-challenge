import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contract test for the one call the in-memory DemoStore can never check: the exact RPC name and
 * argument names SupabaseStore sends to Postgres.
 *
 * This file exists because a previous release shipped two PL/pgSQL faults that every unit and E2E
 * test passed straight through — the whole suite runs against DemoStore, so no test ever touched the
 * real function signature. A typo in an argument name here fails silently at the booth, as a 503.
 */

const rpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc, from: () => ({}) }),
}));

vi.mock('@/lib/config/env', () => ({
  getSupabaseUrl: () => 'https://example-project.supabase.co',
  // Deliberately not shaped like a real key: the Supabase client is mocked and never inspects this,
  // and a realistic secret-key prefix would trip repository secret scanners for no benefit.
  getSupabaseSecretKey: () => 'mocked-key-unused-by-the-stubbed-client',
  isDemoMode: () => false,
}));

const { SupabaseStore } = await import('@/lib/database/supabase-store');

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

describe('SupabaseStore.registerParticipant', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [{ participant_id: 'p-1', duplicate: false }], error: null });
  });

  it('calls register_participant_v2, not the superseded register_participant', async () => {
    await new SupabaseStore().registerParticipant(INPUT);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe('register_participant_v2');
  });

  it('sends every argument the v2 function declares, under the exact parameter names', async () => {
    await new SupabaseStore().registerParticipant(INPUT);
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(Object.keys(args).sort()).toEqual(
      [
        'p_company_name',
        'p_designation',
        'p_email',
        'p_email_normalized',
        'p_full_name',
        'p_marketing_opt_in',
        'p_phone_e164',
        'p_phone_original',
        'p_public_opt_in',
      ].sort(),
    );

    expect(args.p_company_name).toBe('Northwind Analytics');
    expect(args.p_designation).toBe('Head of People');
  });

  it('passes a null designation straight through, since the field is optional', async () => {
    await new SupabaseStore().registerParticipant({ ...INPUT, designation: null });
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args).toHaveProperty('p_designation');
    expect(args.p_designation).toBeNull();
    // Company stays required and must still be sent.
    expect(args.p_company_name).toBe('Northwind Analytics');
  });

  it('reports a duplicate without revealing which identifier matched', async () => {
    rpc.mockResolvedValue({ data: [{ participant_id: 'p-existing', duplicate: true }], error: null });
    const result = await new SupabaseStore().registerParticipant(INPUT);
    expect(result).toEqual({ participantId: 'p-existing', duplicate: true });
  });

  it('surfaces a database error rather than pretending the registration succeeded', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: '42883' } });
    await expect(new SupabaseStore().registerParticipant(INPUT)).rejects.toThrow(/Register participant/);
  });
});
