'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { apiFetch, type PublicLeaderboardResponse, type PublicStatsResponse } from '@/lib/client/api';
import { Button, Eyebrow, Spinner, Stat } from '@/components/ui/primitives';
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table';
import { formatElapsed } from '@/lib/quiz/scoring';
import { formatEventDay } from '@/lib/utils/time';

/**
 * The public leaderboard page body.
 *
 * Polls on the interval an admin configures in settings. Polling rather than realtime is a deliberate
 * choice: at a venue with unreliable Wi-Fi a dropped socket looks like a frozen board, whereas a
 * missed poll simply retries ten seconds later and nobody notices.
 */
export function LiveLeaderboard({ initialRefreshSeconds }: { initialRefreshSeconds: number }) {
  const [board, setBoard] = useState<PublicLeaderboardResponse | null>(null);
  const [stats, setStats] = useState<PublicStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);

  const refreshSeconds = board?.refresh_seconds ?? initialRefreshSeconds;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [boardResult, statsResult] = await Promise.all([
        apiFetch<PublicLeaderboardResponse>('/api/public/leaderboard'),
        apiFetch<PublicStatsResponse>('/api/public/stats'),
      ]);
      if (cancelled) return;

      if (boardResult.ok) setBoard(boardResult.data);
      if (statsResult.ok) setStats(statsResult.data);
      setStale(!boardResult.ok);
      setLoading(false);
    };

    void load();
    const timer = window.setInterval(() => void load(), refreshSeconds * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshSeconds]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Loading the leaderboard" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total challengers" value={stats ? stats.total_challengers.toLocaleString('en-IN') : '—'} />
          <Stat
            label="Average score"
            value={stats?.average_score !== null && stats?.average_score !== undefined ? stats.average_score.toFixed(1) : '—'}
            hint={stats ? `out of ${stats.questions_per_attempt}` : undefined}
          />
          <Stat
            label="Best score"
            value={stats?.best_score !== null && stats?.best_score !== undefined ? `${stats.best_score}/${stats.questions_per_attempt}` : '—'}
            accent
          />
          <Stat
            label="Fastest perfect"
            value={stats?.fastest_perfect_ms ? formatElapsed(stats.fastest_perfect_ms) : 'Still open'}
          />
        </div>

        {stats?.toughest_pillar_label ? (
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Toughest assessment pillar so far:{' '}
            <span className="font-medium text-[var(--color-ink)]">{stats.toughest_pillar_label}</span>
            {stats.toughest_pillar_accuracy !== null
              ? ` · ${Math.round(stats.toughest_pillar_accuracy * 100)}% answered correctly`
              : null}
          </p>
        ) : null}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Live standings</Eyebrow>
            <h2 className="mt-1.5 text-2xl font-semibold sm:text-3xl">
              Top {board?.leaderboard_size ?? 10}
            </h2>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink-faint)]">
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            Updates every {refreshSeconds}s
          </span>
        </div>

        {stale ? (
          <p role="status" className="mb-3 text-sm text-[var(--color-warning)]">
            Showing the last known standings — we could not reach the server on the most recent refresh.
          </p>
        ) : null}

        <LeaderboardTable
          entries={board?.entries ?? []}
          questionsPerAttempt={board?.questions_per_attempt ?? 7}
        />
      </section>

      <section className="surface flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-medium text-[var(--color-ink)]">
            Winner announced at the end of Day 2
          </p>
          {board ? (
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              {formatEventDay(board.winner_announcement_at)} · Top {board.leaderboard_size} entries must be verified at
              the Outskill desk.
            </p>
          ) : null}
        </div>
        <Link href="/challenge">
          <Button size="lg">Think you can beat this?</Button>
        </Link>
      </section>
    </div>
  );
}
