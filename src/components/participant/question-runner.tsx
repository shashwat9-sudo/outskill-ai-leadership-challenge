'use client';

import { useEffect, useRef, useState } from 'react';

import type { OptionId } from '@/lib/config/constants';
import type { ChallengeQuestion } from '@/lib/client/api';
import { CountdownRing, QuestionProgress } from '@/components/participant/countdown-ring';
import { ConnectionBanner, type ConnectionState } from '@/components/participant/connection-status';

/**
 * The timed run.
 *
 * Deliberately dumb: it renders the current question, reports a selection upward and shows the clock.
 * It holds no answers and makes no network calls — the parent owns state so a refresh can restore it,
 * and so there is exactly one submission at the end rather than one request per answer.
 *
 * Correctness is never shown here. The participant learns nothing about their score until the result.
 */

const ADVANCE_DELAY_MS = 260;

export function QuestionRunner({
  question,
  index,
  total,
  remainingMs,
  totalMs,
  connection,
  onAnswer,
}: {
  question: ChallengeQuestion;
  index: number;
  total: number;
  remainingMs: number;
  totalMs: number;
  connection: ConnectionState;
  onAnswer: (questionId: string, optionId: OptionId) => void;
}) {
  // The parent gives this component a `key` of the question id, so a new question remounts it with a
  // fresh, unlocked selection. That is why there is no "reset on question change" effect here.
  const [locked, setLocked] = useState<OptionId | null>(null);
  const advanceTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  function choose(optionId: OptionId) {
    // Guard against a double-tap on a touchscreen and against re-answering after moving on.
    if (locked !== null) return;
    setLocked(optionId);

    advanceTimer.current = window.setTimeout(() => {
      onAnswer(question.question_id, optionId);
    }, ADVANCE_DELAY_MS);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      {connection !== 'online' ? <ConnectionBanner state={connection} /> : null}

      <div className="flex items-start gap-5 sm:gap-8">
        <div className="min-w-0 flex-1">
          <QuestionProgress current={index} total={total} />

          <h1
            className="mt-6 text-balance text-[1.45rem] font-medium leading-snug sm:text-3xl lg:text-[2.1rem]"
            aria-live="polite"
          >
            {question.question_text}
          </h1>
        </div>

        <CountdownRing remainingMs={remainingMs} totalMs={totalMs} />
      </div>

      <fieldset className="mt-1 border-0 p-0" disabled={locked !== null}>
        <legend className="sr-only">Choose the strongest response</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {question.options.map((option, optionIndex) => {
            const isLocked = locked === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option.id)}
                aria-pressed={isLocked}
                data-testid={`answer-option-${optionIndex}`}
                className={[
                  'group flex min-h-[5.25rem] w-full items-start gap-3.5 rounded-[var(--radius-lg)] border p-5 text-left transition-all duration-200',
                  'sm:min-h-[6rem]',
                  isLocked
                    ? 'border-[var(--color-accent)] bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)]'
                    : 'border-[var(--color-hairline-strong)] bg-[var(--color-surface)] hover:border-[var(--color-accent-dim)] hover:bg-[var(--color-surface-2)] active:scale-[0.995]',
                  locked !== null && !isLocked ? 'opacity-40' : '',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold uppercase transition-colors',
                    isLocked
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-canvas)]'
                      : 'border-[var(--color-hairline-strong)] text-[var(--color-ink-faint)] group-hover:border-[var(--color-accent-dim)] group-hover:text-[var(--color-accent-dim)]',
                  ].join(' ')}
                >
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span className="text-[0.98rem] leading-relaxed text-[var(--color-ink)] sm:text-lg">{option.text}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <p className="text-center text-xs text-[var(--color-ink-faint)]">
        You cannot return to a previous question. Unanswered questions count as incorrect.
      </p>
    </div>
  );
}
