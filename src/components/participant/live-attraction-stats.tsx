'use client';

import { useEffect, useState } from 'react';
import { Flame, Users, Zap } from 'lucide-react';
import { apiFetch, type PublicStatsResponse } from '@/lib/client/api';
import { DEFAULT_LEADERBOARD_REFRESH_SECONDS } from '@/lib/config/constants';
import { formatElapsed } from '@/lib/quiz/scoring';

/**
 * Live counters on the attraction screen.
 *
 * Polled rather than pushed: a booth screen refreshing every ten seconds is indistinguishable from
 * realtime to a person walking past, and it avoids holding a socket open on venue Wi-Fi that drops.
 */
export function LiveAttractionStats() {
  const [stats, setStats] = useState<PublicStatsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await apiFetch<PublicStatsResponse>('/api/public/stats');
      if (cancelled) return;
      if (result.ok) {
        setStats(result.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), DEFAULT_LEADERBOARD_REFRESH_SECONDS * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const cards = [
    {
      icon: Users,
      label: 'Challengers so far',
      value: stats ? stats.total_challengers.toLocaleString('en-IN') : '—',
    },
    {
      icon: Flame,
      label: 'Current best score',
      value:
        stats && stats.best_score !== null ? `${stats.best_score}/${stats.questions_per_attempt}` : 'Be the first',
    },
    {
      icon: Zap,
      label: 'Fastest perfect run',
      value: stats?.fastest_perfect_ms ? formatElapsed(stats.fastest_perfect_ms) : 'Still open',
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="surface flex items-center gap-4 px-5 py-4">
            <card.icon aria-hidden className="h-5 w-5 shrink-0 text-[var(--color-accent)]" />
            <div className="min-w-0">
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">{card.label}</p>
              <p className="numeric mt-0.5 truncate text-xl font-semibold text-[var(--color-ink)]">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {failed ? (
        <p className="mt-3 text-xs text-[var(--color-warning)]" role="status">
          Live numbers are temporarily unavailable. The challenge still works.
        </p>
      ) : null}
    </div>
  );
}
