'use client';

import { useEffect, useState } from 'react';
import { Maximize, Wifi, WifiOff } from 'lucide-react';
import { apiFetch, type PublicLeaderboardResponse, type PublicStatsResponse } from '@/lib/client/api';
import { DEFAULT_LEADERBOARD_REFRESH_SECONDS, DISPLAY_SCENE_DURATION_MS } from '@/lib/config/constants';
import { formatElapsed } from '@/lib/quiz/scoring';
import { Wordmark } from '@/components/ui/wordmark';

/**
 * TV display mode.
 *
 * Built for a 1920×1080 screen viewed from across a hall: enormous type, no small controls, and three
 * scenes that rotate on a timer. Rotation pauses while the tab is hidden so a screen that has been
 * backgrounded does not burn through scenes and come back mid-cycle.
 *
 * No QR code: participation is on the booth tablets only. A failed refresh keeps the last good board
 * on screen and simply retries on the next tick, so a brief venue Wi-Fi drop never blanks the TV.
 * The display keeps working after the competition is locked — it just stops changing.
 *
 * Nothing here can render personal data — every name comes from the already-masked public API.
 */

const SCENES = ['leaderboard', 'pulse', 'brand'] as const;
type Scene = (typeof SCENES)[number];

export function DisplayScenes({
  eventName,
  quizTitle,
  supportingLine,
  leaderboardSize,
}: {
  eventName: string;
  quizTitle: string;
  supportingLine: string;
  leaderboardSize: number;
}) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [board, setBoard] = useState<PublicLeaderboardResponse | null>(null);
  const [stats, setStats] = useState<PublicStatsResponse | null>(null);
  const [visible, setVisible] = useState(true);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(
      () => setSceneIndex((current) => (current + 1) % SCENES.length),
      DISPLAY_SCENE_DURATION_MS,
    );
    return () => window.clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const load = async () => {
      const [boardResult, statsResult] = await Promise.all([
        apiFetch<PublicLeaderboardResponse>('/api/public/leaderboard'),
        apiFetch<PublicStatsResponse>('/api/public/stats'),
      ]);
      if (cancelled) return;
      // A failed refresh never clears the screen: the previous board stays up, the indicator turns
      // amber, and the next interval tick retries automatically.
      if (boardResult.ok) setBoard(boardResult.data);
      if (statsResult.ok) setStats(statsResult.data);
      setOnline(boardResult.ok);
    };

    void load();
    const refreshMs = (board?.refresh_seconds ?? DEFAULT_LEADERBOARD_REFRESH_SECONDS) * 1000;
    const timer = window.setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [visible, board?.refresh_seconds]);

  const scene: Scene = SCENES[sceneIndex] ?? 'leaderboard';

  async function goFullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Some kiosk browsers refuse programmatic fullscreen; F11 remains available to the operator.
    }
  }

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[var(--color-canvas)]">
      <header className="flex shrink-0 items-center justify-between px-12 pt-10">
        <div className="flex items-center gap-6">
          <Wordmark size="lg" />
          <span aria-hidden className="h-8 w-px bg-[var(--color-hairline-strong)]" />
          <p className="text-2xl text-[var(--color-ink-muted)]">{eventName}</p>
        </div>

        <div className="flex items-center gap-6">
          <span
            className={`flex items-center gap-2 text-lg ${online ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-warning)]'}`}
            role="status"
            data-testid="display-connection"
          >
            {online ? <Wifi aria-hidden className="h-5 w-5" /> : <WifiOff aria-hidden className="h-5 w-5" />}
            {online ? 'Live' : 'Reconnecting…'}
          </span>
          <button
            type="button"
            onClick={goFullScreen}
            className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-hairline-strong)] px-6 py-4 text-lg text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            <Maximize aria-hidden className="h-6 w-6" />
            Full screen
          </button>
        </div>
      </header>

      <div key={scene} className="animate-scene flex min-h-0 flex-1 items-center px-12 py-8">
        {scene === 'leaderboard' ? (
          <LeaderboardScene board={board} leaderboardSize={leaderboardSize} />
        ) : scene === 'pulse' ? (
          <PulseScene stats={stats} />
        ) : (
          <BrandScene quizTitle={quizTitle} supportingLine={supportingLine} />
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between px-12 pb-8">
        <p className="text-xl text-[var(--color-ink-faint)]">Winner announced at the end of Day 2</p>
        <div className="flex gap-2" aria-hidden>
          {SCENES.map((name, index) => (
            <span
              key={name}
              className={`h-1.5 w-14 rounded-full transition-colors ${index === sceneIndex ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-hairline-strong)]'}`}
            />
          ))}
        </div>
      </footer>
    </div>
  );
}

function LeaderboardScene({
  board,
  leaderboardSize,
}: {
  board: PublicLeaderboardResponse | null;
  leaderboardSize: number;
}) {
  const size = board?.leaderboard_size ?? leaderboardSize;
  const entries = (board?.entries ?? []).slice(0, size);
  const perAttempt = board?.questions_per_attempt ?? 7;

  return (
    <div className="w-full">
      <h1 className="mb-8 text-6xl font-semibold tracking-tight">Live Top {size}</h1>

      {entries.length === 0 ? (
        <p className="text-4xl text-[var(--color-ink-muted)]">
          The board is open. Be the first name on it.
        </p>
      ) : (
        // A single column at top-five: each row can be twice the height and still fit 1080p, which is
        // what makes the board readable from the far side of the hall.
        <ol className="flex flex-col gap-4">
          {entries.map((entry) => (
            <li
              key={entry.rank}
              className="flex items-center gap-8 rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-10 py-5"
            >
              <span
                className={`numeric w-16 text-right text-5xl font-semibold ${entry.rank <= 3 ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-faint)]'}`}
              >
                {entry.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-4xl text-[var(--color-ink)]">{entry.display_name}</span>
              {entry.verified ? (
                <span className="shrink-0 text-xl uppercase tracking-[0.18em] text-[var(--color-success)]">
                  Verified
                </span>
              ) : null}
              <span className="numeric shrink-0 text-4xl font-semibold text-[var(--color-ink)]">
                {entry.correct_count}/{perAttempt}
              </span>
              <span className="numeric w-36 shrink-0 text-right text-3xl text-[var(--color-ink-muted)]">
                {formatElapsed(entry.elapsed_ms)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PulseScene({ stats }: { stats: PublicStatsResponse | null }) {
  const cards = [
    { label: 'Total challengers', value: stats ? stats.total_challengers.toLocaleString('en-IN') : '—' },
    {
      label: 'Average score',
      value:
        stats?.average_score !== null && stats?.average_score !== undefined
          ? `${stats.average_score.toFixed(1)}/${stats.questions_per_attempt}`
          : '—',
    },
    {
      label: 'Best score',
      value:
        stats?.best_score !== null && stats?.best_score !== undefined
          ? `${stats.best_score}/${stats.questions_per_attempt}`
          : '—',
      accent: true,
    },
    { label: 'Toughest pillar', value: stats?.toughest_pillar_label ?? 'Too early to call', small: true },
  ];

  return (
    <div className="w-full">
      <h1 className="mb-10 text-6xl font-semibold tracking-tight">Event pulse</h1>
      <div className="grid grid-cols-2 gap-6">
        {cards.map((card) => (
          <div key={card.label} className="surface px-10 py-9">
            <p className="text-xl uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">{card.label}</p>
            <p
              className={`numeric mt-4 font-semibold leading-none ${card.small ? 'text-5xl' : 'text-7xl'} ${card.accent ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink)]'}`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The brand scene. Deliberately has no QR code and no scan instruction: the only way to play is on a
 * booth tablet, so the call to action is to walk over and ask.
 */
function BrandScene({ quizTitle, supportingLine }: { quizTitle: string; supportingLine: string }) {
  return (
    <div className="flex w-full flex-col items-center text-center">
      <Wordmark size="lg" />
      <h1 className="mt-10 text-[5.5rem] font-semibold leading-[0.98] tracking-tight">{quizTitle}</h1>
      <p className="mt-8 text-4xl text-[var(--color-ink-muted)]">
        Think you can beat the leaderboard?
      </p>
      <p className="mt-10 text-3xl font-medium text-[var(--color-accent)]">{supportingLine}</p>
      <p className="mt-12 text-3xl text-[var(--color-ink)]">
        Ask the Outskill team for a tablet to take the challenge.
      </p>
    </div>
  );
}
