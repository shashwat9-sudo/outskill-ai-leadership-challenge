import { GRACE_ELAPSED_MS, SUBMISSION_GRACE_MS, type OptionId } from '@/lib/config/constants';

/**
 * Server-authoritative scoring and timing.
 *
 * Nothing here reads a client-supplied score, rank or timestamp. The only client input is which option
 * was selected for each question; everything else comes from the database row for the attempt.
 */

export type SubmittedAnswer = {
  question_id: string;
  selected_option_id: OptionId | null;
  /** Milliseconds from the participant's start, kept for later analysis only — never used for ranking. */
  answered_offset_ms: number | null;
};

export type GradedAnswer = {
  question_id: string;
  selected_option_id: OptionId | null;
  answered_offset_ms: number | null;
  is_correct: boolean;
};

export type GradeResult = {
  answers: GradedAnswer[];
  correct_count: number;
};

/**
 * Grade a submission against the answer key held server-side.
 *
 * Questions the participant never reached are graded as incorrect, which is why the loop iterates the
 * served questions rather than the submitted answers.
 */
export function gradeAttempt(
  servedQuestionIds: readonly string[],
  answerKey: ReadonlyMap<string, OptionId>,
  submitted: readonly SubmittedAnswer[],
): GradeResult {
  const submittedById = new Map(submitted.map((answer) => [answer.question_id, answer]));

  const answers: GradedAnswer[] = servedQuestionIds.map((questionId) => {
    const answer = submittedById.get(questionId);
    const selected = answer?.selected_option_id ?? null;
    const correct = answerKey.get(questionId);
    return {
      question_id: questionId,
      selected_option_id: selected,
      answered_offset_ms: answer?.answered_offset_ms ?? null,
      is_correct: selected !== null && correct !== undefined && selected === correct,
    };
  });

  return {
    answers,
    correct_count: answers.filter((answer) => answer.is_correct).length,
  };
}

export type TimingVerdict =
  | { outcome: 'accepted'; elapsed_ms: number; within_grace: boolean }
  | { outcome: 'timed_out'; elapsed_ms: number };

/**
 * Decide whether a submission is in time, and what elapsed time to record.
 *
 * Rules:
 *  - arriving before the visible deadline  -> record the real elapsed time
 *  - arriving within SUBMISSION_GRACE_MS after the deadline -> accept, but record the full duration,
 *    so a slow network can never beat someone who genuinely finished faster
 *  - arriving later -> timed out
 */
export function evaluateTiming(input: {
  startedAtMs: number;
  deadlineAtMs: number;
  receivedAtMs: number;
  graceMs?: number;
  fullDurationMs?: number;
}): TimingVerdict {
  const graceMs = input.graceMs ?? SUBMISSION_GRACE_MS;
  const fullDurationMs = input.fullDurationMs ?? Math.max(GRACE_ELAPSED_MS, input.deadlineAtMs - input.startedAtMs);
  const elapsed = input.receivedAtMs - input.startedAtMs;

  if (input.receivedAtMs <= input.deadlineAtMs) {
    // Guard against a clock skew producing a negative or absurdly small elapsed time.
    return { outcome: 'accepted', elapsed_ms: Math.max(0, Math.round(elapsed)), within_grace: false };
  }

  if (input.receivedAtMs <= input.deadlineAtMs + graceMs) {
    return { outcome: 'accepted', elapsed_ms: fullDurationMs, within_grace: true };
  }

  return { outcome: 'timed_out', elapsed_ms: fullDurationMs };
}

/** Public score label, e.g. "7/7 · 34.8s". */
export function formatScoreLabel(correctCount: number, elapsedMs: number, total: number): string {
  return `${correctCount}/${total} · ${formatElapsed(elapsedMs)}`;
}

/** One decimal place, always — "34.8s", "60.0s". */
export function formatElapsed(elapsedMs: number): string {
  return `${(Math.max(0, elapsedMs) / 1000).toFixed(1)}s`;
}
