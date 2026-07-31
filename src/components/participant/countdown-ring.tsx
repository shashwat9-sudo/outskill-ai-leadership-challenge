'use client';

/**
 * Countdown ring.
 *
 * A ring rather than a bar because it reads instantly from across the booth, and because the final
 * fifteen seconds can escalate through colour and stroke without shifting the layout. Urgency is
 * expressed in colour *and* in the numeric readout, never in motion alone — see the reduced-motion
 * rule in CSS.
 */

import { URGENT_THRESHOLD_SECONDS } from '@/lib/config/constants';

export function CountdownRing({
  remainingMs,
  totalMs,
  size = 132,
}: {
  remainingMs: number;
  totalMs: number;
  size?: number;
}) {
  const remainingSeconds = Math.max(0, remainingMs / 1000);
  const progress = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const urgent = remainingSeconds <= URGENT_THRESHOLD_SECONDS;

  const stroke = urgent ? 9 : 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  const colour = urgent ? 'var(--color-danger)' : 'var(--color-accent)';

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={`${Math.ceil(remainingSeconds)} seconds remaining`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 220ms linear, stroke 300ms ease' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`numeric text-3xl font-semibold tabular-nums ${urgent ? 'text-[var(--color-danger)] animate-urgent' : 'text-[var(--color-ink)]'}`}
          style={{ fontSize: size * 0.26 }}
        >
          {Math.ceil(remainingSeconds)}
        </span>
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">seconds</span>
      </div>
    </div>
  );
}

/** Thin progress bar showing position through the question set. */
export function QuestionProgress({ current, total }: { current: number; total: number }) {
  const percent = total > 0 ? Math.round(((current + 1) / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between text-xs">
        <span className="uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
          Question {current + 1} of {total}
        </span>
        <span className="numeric text-[var(--color-ink-muted)]">{percent}%</span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-hairline)]"
        role="progressbar"
        aria-valuenow={current + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Question ${current + 1} of ${total}`}
      >
        <div
          className="accent-gradient h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
