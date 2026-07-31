'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Check, Clock, ListChecks, Sparkles, Trophy, X } from 'lucide-react';
import { Badge, Button, Eyebrow } from '@/components/ui/primitives';
import { formatElapsed } from '@/lib/quiz/scoring';
import type { SubmitResponse } from '@/lib/client/api';

/**
 * The result screen: score summary, then a per-question answer review.
 *
 * What a participant may see is decided on the server (`src/lib/quiz/review.ts`), not here. The
 * payload this component renders contains only the option the participant chose — there is no
 * correct_option_id and no text for the options they did not pick, so this screen cannot reveal the
 * answer key even by accident.
 *
 * There is deliberately no share, print, email or copy control: the result lives on this tablet for
 * the length of the review window and then the tablet resets for the next person.
 */

const CALCULATING_MS = 1_400;

type Tab = 'summary' | 'review';

export function ResultPanel({
  result,
  kiosk,
  autoResetSeconds,
  secondsRemaining,
  onReset,
}: {
  result: SubmitResponse;
  kiosk: boolean;
  autoResetSeconds: number;
  /** Countdown owned by the parent, so switching tabs here can never restart or pause the reset. */
  secondsRemaining: number | null;
  onReset: () => void;
}) {
  const [calculating, setCalculating] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');

  useEffect(() => {
    const timer = window.setTimeout(() => setCalculating(false), CALCULATING_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (calculating) return <CalculatingState />;

  return (
    <div className="animate-fade-up mx-auto w-full max-w-3xl">
      <div className="flex justify-center gap-2" role="tablist" aria-label="Your result">
        <TabButton active={tab === 'summary'} onClick={() => setTab('summary')} controls="result-summary">
          <Trophy aria-hidden className="h-4 w-4" />
          Your score
        </TabButton>
        <TabButton active={tab === 'review'} onClick={() => setTab('review')} controls="result-review">
          <ListChecks aria-hidden className="h-4 w-4" />
          Review answers
        </TabButton>
      </div>

      <div className="mt-8">
        {tab === 'summary' ? (
          <Summary result={result} />
        ) : (
          <AnswerReview review={result.review} total={result.total_questions} />
        )}
      </div>

      <div className="mt-10 flex flex-col items-center gap-4">
        <Button size="lg" onClick={onReset} className="w-full sm:w-auto" data-testid="next-participant">
          {kiosk ? 'Done — Next Participant' : 'Back to start'}
        </Button>

        {kiosk ? (
          <p className="text-sm text-[var(--color-ink-faint)]" role="status" aria-live="polite" data-testid="reset-countdown">
            Resetting for the next participant in {secondsRemaining ?? autoResetSeconds} seconds
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`flex min-h-[3rem] items-center gap-2 rounded-[var(--radius-md)] px-5 text-base font-medium transition-colors ${
        active
          ? 'bg-[var(--color-accent)] text-[var(--color-canvas)]'
          : 'border border-[var(--color-hairline-strong)] text-[var(--color-ink-muted)]'
      }`}
    >
      {children}
    </button>
  );
}

function Summary({ result }: { result: SubmitResponse }) {
  return (
    <div id="result-summary" role="tabpanel" className="text-center">
      <Eyebrow>{result.timed_out ? 'Time expired' : 'Challenge complete'}</Eyebrow>

      <p className="mt-6 text-[4.5rem] font-semibold leading-none tracking-tight sm:text-[6rem]">
        <span className="numeric text-[var(--color-accent)]">{result.correct_count}</span>
        <span className="text-[var(--color-ink-faint)]">/{result.total_questions}</span>
      </p>
      <p className="mt-2 text-lg text-[var(--color-ink-muted)]">
        You scored {result.correct_count} out of {result.total_questions}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <div className="surface px-5 py-4">
          <p className="flex items-center justify-center gap-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
            <Clock aria-hidden className="h-3.5 w-3.5" />
            Completed in
          </p>
          <p className="numeric mt-1.5 text-2xl font-semibold">{formatElapsed(result.elapsed_ms)}</p>
        </div>
        <div className="surface px-5 py-4">
          <p className="flex items-center justify-center gap-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
            <Trophy aria-hidden className="h-3.5 w-3.5" />
            Current position
          </p>
          <p className="numeric mt-1.5 text-2xl font-semibold text-[var(--color-accent)]">
            {result.rank !== null ? `#${result.rank}` : '—'}
          </p>
        </div>
      </div>

      {result.in_top_n ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--color-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)] p-6 text-left">
          <p className="flex items-center gap-2 text-lg font-semibold text-[var(--color-accent)]">
            <Sparkles aria-hidden className="h-5 w-5" />
            You&rsquo;re in the Top {result.top_n}.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink)]">
            Please visit the Outskill desk to verify your entry and secure your leaderboard position.
          </p>
          <div className="mt-4">
            {result.verified ? (
              <Badge tone="success">
                <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
                Verified
              </Badge>
            ) : (
              <Badge tone="warning">Pending verification</Badge>
            )}
          </div>
        </div>
      ) : null}

      <div className="accent-gradient mt-6 rounded-[var(--radius-lg)] p-[1px]">
        <div className="rounded-[calc(var(--radius-lg)-1px)] bg-[var(--color-canvas)] px-6 py-5">
          <p className="text-base font-semibold text-[var(--color-ink)] sm:text-lg">
            Show this screen to the Outskill team.
          </p>
          <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">{result.spin_cta_text}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The per-question review.
 *
 * For a wrong or unanswered question this shows what the participant chose, marks it incorrect and
 * explains the principle — but never names the option that was right. Teaching the principle is the
 * point; handing over the answer key to the next person in the queue is not.
 */
function AnswerReview({ review, total }: { review: SubmitResponse['review']; total: number }) {
  if (review.length === 0) {
    return (
      <p id="result-review" role="tabpanel" className="text-center text-[var(--color-ink-muted)]">
        This challenge has no answers to review.
      </p>
    );
  }

  return (
    <div id="result-review" role="tabpanel" className="space-y-3 text-left">
      <p className="text-center text-sm text-[var(--color-ink-muted)]">
        All {total} decisions, with the principle behind each one.
      </p>

      {review.map((item) => (
        <article
          key={item.question_number}
          className="surface p-5"
          data-testid="review-item"
          data-correct={item.is_correct}
        >
          <div className="flex items-start justify-between gap-4">
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
              Question {item.question_number}
            </p>
            {item.is_correct ? (
              <Badge tone="success">
                <Check aria-hidden className="h-3.5 w-3.5" />
                Correct
              </Badge>
            ) : (
              <Badge tone="danger">
                <X aria-hidden className="h-3.5 w-3.5" />
                {item.answered ? 'Incorrect' : 'Not answered'}
              </Badge>
            )}
          </div>

          <p className="mt-2 text-base font-medium leading-snug text-[var(--color-ink)]">{item.question_text}</p>

          <div className="mt-4">
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">Your answer</p>
            {item.answered ? (
              <p
                className={`mt-1 text-sm leading-relaxed ${
                  item.is_correct ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                }`}
              >
                &ldquo;{item.selected_option_text}&rdquo;
              </p>
            ) : (
              <p className="mt-1 text-sm italic text-[var(--color-ink-faint)]">
                You did not answer this question.
              </p>
            )}
          </div>

          <p className="mt-4 border-t border-[var(--color-hairline)] pt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {item.principle}
          </p>
        </article>
      ))}
    </div>
  );
}

function CalculatingState() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-16 text-center" role="status" aria-live="polite">
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-[var(--color-hairline)]">
        <div className="animate-shimmer h-full w-full rounded-full bg-[var(--color-hairline)]" />
      </div>
      <p className="text-lg text-[var(--color-ink-muted)]">Calculating your result…</p>
    </div>
  );
}
