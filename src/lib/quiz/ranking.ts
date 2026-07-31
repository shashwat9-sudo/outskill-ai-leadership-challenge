import { buildPublicName } from '@/lib/utils/identity';
import { formatScoreLabel } from '@/lib/quiz/scoring';
import type { LeaderboardRow, PublicLeaderboardEntry } from '@/types/domain';

/**
 * Ranking rules, shared by the SQL view and the in-memory demo store so both can never drift.
 *
 * Order: more correct answers, then a faster time, then an earlier submission.
 * The final tie-break on submitted_at makes the order total and stable — two identical scores at
 * identical times still produce a deterministic rank rather than flickering between refreshes.
 */

export type RankableAttempt = {
  correct_count: number;
  elapsed_ms: number;
  submitted_at: string;
};

export function compareAttempts(left: RankableAttempt, right: RankableAttempt): number {
  if (left.correct_count !== right.correct_count) return right.correct_count - left.correct_count;
  if (left.elapsed_ms !== right.elapsed_ms) return left.elapsed_ms - right.elapsed_ms;
  return Date.parse(left.submitted_at) - Date.parse(right.submitted_at);
}

/** Sort and assign 1-based dense positions. Ties are impossible by construction (see compareAttempts). */
export function rankAttempts<T extends RankableAttempt>(attempts: readonly T[]): (T & { rank: number })[] {
  return [...attempts]
    .sort(compareAttempts)
    .map((attempt, index) => ({ ...attempt, rank: index + 1 }));
}

/**
 * Project a ranked row into the shape the browser is allowed to receive.
 * The full name, email, phone, consent flags and database ids are dropped here and nowhere else.
 */
export function toPublicEntry(row: LeaderboardRow, questionsPerAttempt: number): PublicLeaderboardEntry {
  return {
    rank: row.rank,
    display_name: buildPublicName(row.full_name, row.public_leaderboard_opt_in, row.public_number),
    correct_count: row.correct_count,
    elapsed_ms: row.elapsed_ms,
    verified: row.verified,
    score_label: formatScoreLabel(row.correct_count, row.elapsed_ms, questionsPerAttempt),
  };
}

/**
 * The provisional winner is simply rank 1. The verified winner is the highest-ranked entry that booth
 * staff have actually verified — that is the only one eligible for the prize.
 */
export function findWinners(rows: readonly LeaderboardRow[]): {
  provisional: LeaderboardRow | null;
  verified: LeaderboardRow | null;
} {
  const ordered = [...rows].sort(compareAttempts);
  return {
    provisional: ordered[0] ?? null,
    verified: ordered.find((row) => row.verified) ?? null,
  };
}
