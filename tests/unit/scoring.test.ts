import { describe, expect, it } from 'vitest';
import { evaluateTiming, formatElapsed, formatScoreLabel, gradeAttempt } from '@/lib/quiz/scoring';
import {
  DEFAULT_QUIZ_DURATION_SECONDS,
  GRACE_ELAPSED_MS,
  SUBMISSION_GRACE_MS,
  type OptionId,
} from '@/lib/config/constants';

const KEY = new Map<string, OptionId>([
  ['q1', 'a'],
  ['q2', 'b'],
  ['q3', 'c'],
  ['q4', 'd'],
  ['q5', 'a'],
  ['q6', 'b'],
  ['q7', 'c'],
]);

const SERVED = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];

function answer(id: string, selected: OptionId | null, offset = 1000) {
  return { question_id: id, selected_option_id: selected, answered_offset_ms: offset };
}

describe('grading', () => {
  it('scores a perfect run', () => {
    const submitted = SERVED.map((id) => answer(id, KEY.get(id) ?? 'a'));
    expect(gradeAttempt(SERVED, KEY, submitted).correct_count).toBe(7);
  });

  it('scores a run with no correct answers', () => {
    const submitted = SERVED.map((id) => answer(id, KEY.get(id) === 'a' ? 'b' : 'a'));
    expect(gradeAttempt(SERVED, KEY, submitted).correct_count).toBe(0);
  });

  it('counts unanswered questions as incorrect', () => {
    const submitted = [answer('q1', 'a'), answer('q2', 'b')];
    const result = gradeAttempt(SERVED, KEY, submitted);
    expect(result.correct_count).toBe(2);
    expect(result.answers).toHaveLength(7);
    expect(result.answers.filter((entry) => entry.selected_option_id === null)).toHaveLength(5);
  });

  it('counts an explicit null selection as incorrect', () => {
    const result = gradeAttempt(SERVED, KEY, [answer('q1', null)]);
    expect(result.answers[0]?.is_correct).toBe(false);
  });

  it('ignores answers for questions that were never served', () => {
    const submitted = [...SERVED.map((id) => answer(id, KEY.get(id) ?? 'a')), answer('not-served', 'a')];
    const result = gradeAttempt(SERVED, KEY, submitted);
    expect(result.answers).toHaveLength(7);
    expect(result.correct_count).toBe(7);
  });

  it('grades one row per served question, in the served order', () => {
    const result = gradeAttempt(SERVED, KEY, [answer('q3', 'c')]);
    expect(result.answers.map((entry) => entry.question_id)).toEqual(SERVED);
  });

  it('keeps answered_offset_ms for analysis without using it to score', () => {
    const result = gradeAttempt(SERVED, KEY, [answer('q1', 'a', 4321)]);
    expect(result.answers[0]?.answered_offset_ms).toBe(4321);
    expect(result.answers[0]?.is_correct).toBe(true);
  });

  it('handles a question missing from the answer key without crediting it', () => {
    const partialKey = new Map<string, OptionId>([['q1', 'a']]);
    const result = gradeAttempt(SERVED, partialKey, SERVED.map((id) => answer(id, 'a')));
    expect(result.correct_count).toBe(1);
  });
});

describe('timing and the submission grace window', () => {
  const startedAtMs = 1_000_000;
  // Mirrors the real event configuration: a 130-second attempt window.
  const deadlineAtMs = startedAtMs + DEFAULT_QUIZ_DURATION_SECONDS * 1_000;

  it('records the real elapsed time for a submission comfortably inside the window', () => {
    const verdict = evaluateTiming({ startedAtMs, deadlineAtMs, receivedAtMs: startedAtMs + 34_800 });
    expect(verdict.outcome).toBe('accepted');
    expect(verdict.elapsed_ms).toBe(34_800);
  });

  it('accepts a submission that lands exactly on the deadline', () => {
    const verdict = evaluateTiming({ startedAtMs, deadlineAtMs, receivedAtMs: deadlineAtMs });
    expect(verdict.outcome).toBe('accepted');
    expect(verdict.elapsed_ms).toBe(GRACE_ELAPSED_MS);
  });

  it('accepts a submission inside the 3-second grace and records the full duration', () => {
    const verdict = evaluateTiming({ startedAtMs, deadlineAtMs, receivedAtMs: deadlineAtMs + 2_500 });
    expect(verdict.outcome).toBe('accepted');
    expect(verdict.elapsed_ms).toBe(GRACE_ELAPSED_MS);
    if (verdict.outcome === 'accepted') expect(verdict.within_grace).toBe(true);
  });

  it('accepts a submission at the very edge of the grace window', () => {
    const verdict = evaluateTiming({
      startedAtMs,
      deadlineAtMs,
      receivedAtMs: deadlineAtMs + SUBMISSION_GRACE_MS,
    });
    expect(verdict.outcome).toBe('accepted');
    expect(verdict.elapsed_ms).toBe(GRACE_ELAPSED_MS);
  });

  it('times out one millisecond past the grace window', () => {
    const verdict = evaluateTiming({
      startedAtMs,
      deadlineAtMs,
      receivedAtMs: deadlineAtMs + SUBMISSION_GRACE_MS + 1,
    });
    expect(verdict.outcome).toBe('timed_out');
  });

  it('times out a submission that arrives long after the deadline', () => {
    const verdict = evaluateTiming({ startedAtMs, deadlineAtMs, receivedAtMs: deadlineAtMs + 300_000 });
    expect(verdict.outcome).toBe('timed_out');
    expect(verdict.elapsed_ms).toBe(GRACE_ELAPSED_MS);
  });

  it('a grace submission can never beat a genuinely fast run', () => {
    const fast = evaluateTiming({ startedAtMs, deadlineAtMs, receivedAtMs: startedAtMs + 41_000 });
    const grace = evaluateTiming({ startedAtMs, deadlineAtMs, receivedAtMs: deadlineAtMs + 2_000 });
    expect(fast.elapsed_ms).toBeLessThan(grace.elapsed_ms);
  });

  it('never records a negative elapsed time when a clock runs backwards', () => {
    const verdict = evaluateTiming({ startedAtMs, deadlineAtMs, receivedAtMs: startedAtMs - 5_000 });
    expect(verdict.elapsed_ms).toBe(0);
  });

  it('honours a non-default duration', () => {
    const shortDeadline = startedAtMs + 30_000;
    const verdict = evaluateTiming({
      startedAtMs,
      deadlineAtMs: shortDeadline,
      receivedAtMs: shortDeadline + 1_000,
      fullDurationMs: 30_000,
    });
    expect(verdict.outcome).toBe('accepted');
    expect(verdict.elapsed_ms).toBe(30_000);
  });
});

describe('formatting', () => {
  it('renders the public score label', () => {
    expect(formatScoreLabel(7, 34_800, 7)).toBe('7/7 · 34.8s');
  });

  it('always shows one decimal place', () => {
    expect(formatElapsed(60_000)).toBe('60.0s');
    expect(formatElapsed(9_010)).toBe('9.0s');
    expect(formatElapsed(0)).toBe('0.0s');
  });

  it('clamps a negative duration to zero rather than printing "-1.0s"', () => {
    expect(formatElapsed(-500)).toBe('0.0s');
  });
});
