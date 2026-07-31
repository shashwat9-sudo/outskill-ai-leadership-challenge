'use client';

import { BadgeCheck, Clock3 } from 'lucide-react';
import { Badge, EmptyState } from '@/components/ui/primitives';
import { formatElapsed } from '@/lib/quiz/scoring';
import type { PublicLeaderboardResponse } from '@/lib/client/api';

type Entry = PublicLeaderboardResponse['entries'][number];

const MEDAL_TONE: Record<number, string> = {
  1: 'text-[var(--color-accent)]',
  2: 'text-[var(--color-accent-2)]',
  3: 'text-[var(--color-ink)]',
};

/**
 * Public leaderboard rows.
 *
 * Everything on screen has already been masked server-side: `display_name` is either "Ananya S." or
 * "Anonymous Leader 184". This component has no access to a full name, an email or a phone number.
 */
export function LeaderboardTable({
  entries,
  questionsPerAttempt,
  highlightRank,
  compact = false,
}: {
  entries: Entry[];
  questionsPerAttempt: number;
  highlightRank?: number | null;
  compact?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No scores yet"
        description="Be the first name on the board. The challenge takes 130 seconds."
      />
    );
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Live leaderboard">
      {entries.map((entry) => {
        const highlighted = highlightRank === entry.rank;
        return (
          <li
            key={`${entry.rank}-${entry.display_name}`}
            className={[
              'flex items-center gap-4 rounded-[var(--radius-lg)] border px-4 transition-colors sm:px-5',
              compact ? 'py-3' : 'py-4',
              highlighted
                ? 'border-[var(--color-accent)] bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)]'
                : 'border-[var(--color-hairline)] bg-[var(--color-surface)]',
            ].join(' ')}
          >
            <span
              className={`numeric w-9 shrink-0 text-right text-lg font-semibold sm:w-11 sm:text-xl ${MEDAL_TONE[entry.rank] ?? 'text-[var(--color-ink-faint)]'}`}
            >
              {entry.rank}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.98rem] font-medium text-[var(--color-ink)] sm:text-lg">
                {entry.display_name}
              </p>
              <div className="mt-1 flex items-center gap-2">
                {entry.verified ? (
                  <Badge tone="success">
                    <BadgeCheck aria-hidden className="h-3 w-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <Clock3 aria-hidden className="h-3 w-3" />
                    Pending verification
                  </Badge>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="numeric text-lg font-semibold text-[var(--color-ink)] sm:text-xl">
                {entry.correct_count}/{questionsPerAttempt}
              </p>
              <p className="numeric text-xs text-[var(--color-ink-muted)]">{formatElapsed(entry.elapsed_ms)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
