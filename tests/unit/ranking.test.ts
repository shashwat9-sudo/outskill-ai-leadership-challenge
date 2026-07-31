import { describe, expect, it } from 'vitest';
import { compareAttempts, findWinners, rankAttempts, toPublicEntry } from '@/lib/quiz/ranking';
import type { LeaderboardRow } from '@/types/domain';

function row(overrides: Partial<LeaderboardRow> & { correct_count: number; elapsed_ms: number; submitted_at: string }): LeaderboardRow {
  return {
    rank: 0,
    attempt_id: overrides.attempt_id ?? `attempt-${overrides.correct_count}-${overrides.elapsed_ms}`,
    participant_id: overrides.participant_id ?? 'participant',
    verified: overrides.verified ?? false,
    public_leaderboard_opt_in: overrides.public_leaderboard_opt_in ?? true,
    full_name: overrides.full_name ?? 'Ananya Sharma',
    public_number: overrides.public_number ?? 184,
    ...overrides,
  };
}

const T = (seconds: number) => new Date(Date.UTC(2026, 7, 6, 10, 0, seconds)).toISOString();

describe('ranking order', () => {
  it('puts a higher score first', () => {
    const ranked = rankAttempts([
      row({ correct_count: 5, elapsed_ms: 20_000, submitted_at: T(1) }),
      row({ correct_count: 7, elapsed_ms: 55_000, submitted_at: T(2) }),
    ]);
    expect(ranked[0]?.correct_count).toBe(7);
  });

  it('breaks a score tie with the faster time', () => {
    const ranked = rankAttempts([
      row({ correct_count: 7, elapsed_ms: 41_200, submitted_at: T(1) }),
      row({ correct_count: 7, elapsed_ms: 34_800, submitted_at: T(2) }),
    ]);
    expect(ranked[0]?.elapsed_ms).toBe(34_800);
  });

  it('breaks a score-and-time tie with the earlier submission', () => {
    const ranked = rankAttempts([
      row({ correct_count: 7, elapsed_ms: 34_800, submitted_at: T(30), attempt_id: 'later' }),
      row({ correct_count: 7, elapsed_ms: 34_800, submitted_at: T(10), attempt_id: 'earlier' }),
    ]);
    expect(ranked[0]?.attempt_id).toBe('earlier');
  });

  it('assigns contiguous 1-based ranks', () => {
    const ranked = rankAttempts([
      row({ correct_count: 4, elapsed_ms: 30_000, submitted_at: T(1) }),
      row({ correct_count: 7, elapsed_ms: 30_000, submitted_at: T(2) }),
      row({ correct_count: 6, elapsed_ms: 30_000, submitted_at: T(3) }),
    ]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('produces a total, stable order — no two entries can share a position', () => {
    const rows = [
      row({ correct_count: 7, elapsed_ms: 34_800, submitted_at: T(5), attempt_id: 'a' }),
      row({ correct_count: 7, elapsed_ms: 34_800, submitted_at: T(7), attempt_id: 'b' }),
      row({ correct_count: 7, elapsed_ms: 34_800, submitted_at: T(6), attempt_id: 'c' }),
    ];
    const first = rankAttempts(rows).map((entry) => entry.attempt_id);
    const second = rankAttempts([...rows].reverse()).map((entry) => entry.attempt_id);
    expect(first).toEqual(second);
    expect(first).toEqual(['a', 'c', 'b']);
  });

  it('does not mutate the input array', () => {
    const rows = [
      row({ correct_count: 3, elapsed_ms: 10_000, submitted_at: T(1), attempt_id: 'low' }),
      row({ correct_count: 7, elapsed_ms: 10_000, submitted_at: T(2), attempt_id: 'high' }),
    ];
    rankAttempts(rows);
    expect(rows[0]?.attempt_id).toBe('low');
  });

  it('handles an empty board', () => {
    expect(rankAttempts([])).toEqual([]);
  });

  it('compareAttempts returns zero only for a genuinely identical entry', () => {
    const a = row({ correct_count: 7, elapsed_ms: 34_800, submitted_at: T(5) });
    expect(compareAttempts(a, a)).toBe(0);
  });
});

describe('public projection', () => {
  it('shows a masked name for an opted-in participant', () => {
    const entry = toPublicEntry(row({ correct_count: 7, elapsed_ms: 34_800, submitted_at: T(1), rank: 1 }), 7);
    expect(entry.display_name).toBe('Ananya S.');
    expect(entry.score_label).toBe('7/7 · 34.8s');
  });

  it('shows an anonymous label when the participant did not opt in', () => {
    const entry = toPublicEntry(
      row({
        correct_count: 6,
        elapsed_ms: 40_000,
        submitted_at: T(1),
        rank: 2,
        public_leaderboard_opt_in: false,
        public_number: 184,
      }),
      7,
    );
    expect(entry.display_name).toBe('Anonymous Leader 184');
  });

  it('never leaks contact details, consent flags or database ids', () => {
    const source = row({
      correct_count: 7,
      elapsed_ms: 34_800,
      submitted_at: T(1),
      rank: 1,
      attempt_id: 'secret-attempt-id',
      participant_id: 'secret-participant-id',
      full_name: 'Ananya Sharma',
    });
    const serialised = JSON.stringify(toPublicEntry(source, 7));

    expect(serialised).not.toContain('secret-attempt-id');
    expect(serialised).not.toContain('secret-participant-id');
    expect(serialised).not.toContain('Sharma');
    expect(serialised).not.toContain('marketing');
    expect(serialised).not.toContain('participant_id');
  });

  it('exposes only the agreed public fields', () => {
    const entry = toPublicEntry(row({ correct_count: 7, elapsed_ms: 1_000, submitted_at: T(1), rank: 1 }), 7);
    expect(Object.keys(entry).sort()).toEqual([
      'correct_count',
      'display_name',
      'elapsed_ms',
      'rank',
      'score_label',
      'verified',
    ]);
  });
});

describe('winner selection', () => {
  const board = [
    row({ correct_count: 7, elapsed_ms: 30_000, submitted_at: T(1), attempt_id: 'top-unverified', verified: false }),
    row({ correct_count: 7, elapsed_ms: 32_000, submitted_at: T(2), attempt_id: 'second-verified', verified: true }),
    row({ correct_count: 6, elapsed_ms: 20_000, submitted_at: T(3), attempt_id: 'third-verified', verified: true }),
  ];

  it('reports rank 1 as the provisional winner regardless of verification', () => {
    expect(findWinners(board).provisional?.attempt_id).toBe('top-unverified');
  });

  it('reports the highest verified entry as the verified winner', () => {
    expect(findWinners(board).verified?.attempt_id).toBe('second-verified');
  });

  it('reports no verified winner when nobody has been verified', () => {
    const unverified = board.map((entry) => ({ ...entry, verified: false }));
    expect(findWinners(unverified).verified).toBeNull();
  });

  it('reports nothing on an empty board', () => {
    expect(findWinners([])).toEqual({ provisional: null, verified: null });
  });
});
