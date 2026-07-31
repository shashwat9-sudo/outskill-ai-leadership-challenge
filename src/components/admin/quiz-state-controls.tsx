'use client';

import { useState } from 'react';
import { Lock, Pause, Play, ShieldAlert } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { Badge, Button } from '@/components/ui/primitives';
import type { QuizState } from '@/lib/config/constants';

const LOCK_CONFIRMATION = 'LOCK THE CHALLENGE';
const UNLOCK_CONFIRMATION = 'UNLOCK THE CHALLENGE';

const STATE_TONE: Record<QuizState, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  paused: 'warning',
  locked: 'danger',
};

const STATE_LABEL: Record<QuizState, string> = {
  active: 'Active — accepting entries',
  paused: 'Paused — no new entries',
  locked: 'Locked — event closed',
};

/**
 * Start / pause / lock.
 *
 * Locking ends the event, so it demands a typed confirmation phrase rather than an "are you sure"
 * dialog that a thumb can dismiss. Unlocking a locked event demands a different phrase, because on
 * Day 2 evening an accidental unlock would reopen a closed competition.
 */
export function QuizStateControls({ state, onChanged }: { state: QuizState; onChanged: () => void }) {
  const [pending, setPending] = useState<QuizState | null>(null);
  const [confirming, setConfirming] = useState<QuizState | null>(null);
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const requiredPhrase = confirming === 'locked' ? LOCK_CONFIRMATION : UNLOCK_CONFIRMATION;

  async function apply(next: QuizState, confirmation?: string) {
    setPending(next);
    setError(null);

    const result = await apiFetch('/api/admin/quiz-state', {
      method: 'POST',
      body: JSON.stringify({ quiz_state: next, confirmation }),
    });

    setPending(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setConfirming(null);
    setPhrase('');
    onChanged();
  }

  function request(next: QuizState) {
    setError(null);
    // Both locking, and leaving a locked state, are dangerous enough to require a typed phrase.
    if (next === 'locked' || state === 'locked') {
      setConfirming(next);
      setPhrase('');
      return;
    }
    void apply(next);
  }

  return (
    <div className="surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">Challenge status</p>
          <div className="mt-2">
            <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={state === 'active' ? 'secondary' : 'primary'}
            onClick={() => request('active')}
            disabled={pending !== null || state === 'active'}
          >
            <Play aria-hidden className="h-4 w-4" />
            Start
          </Button>
          <Button
            variant="secondary"
            onClick={() => request('paused')}
            disabled={pending !== null || state === 'paused'}
          >
            <Pause aria-hidden className="h-4 w-4" />
            Pause
          </Button>
          <Button variant="danger" onClick={() => request('locked')} disabled={pending !== null || state === 'locked'}>
            <Lock aria-hidden className="h-4 w-4" />
            Lock
          </Button>
        </div>
      </div>

      {confirming ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_8%,transparent)] p-5">
          <p className="flex items-start gap-2 text-sm font-medium text-[var(--color-danger)]">
            <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {confirming === 'locked'
              ? 'Locking stops all new registrations and attempts for the rest of the event.'
              : 'This event is locked. Reopening it allows new entries onto a closed leaderboard.'}
          </p>

          <label className="mt-4 block text-sm text-[var(--color-ink-muted)]">
            Type <span className="font-mono font-semibold text-[var(--color-ink)]">{requiredPhrase}</span> to confirm
            <input
              type="text"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              autoComplete="off"
              className="mt-2 w-full min-h-[3rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-4 text-base text-[var(--color-ink)] focus:border-[var(--color-accent)]"
            />
          </label>

          <div className="mt-4 flex gap-2">
            <Button
              variant="danger"
              onClick={() => void apply(confirming, phrase)}
              disabled={phrase !== requiredPhrase || pending !== null}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(null);
                setPhrase('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
