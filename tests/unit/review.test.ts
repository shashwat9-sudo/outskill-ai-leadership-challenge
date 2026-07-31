import { describe, expect, it } from 'vitest';
import { buildParticipantReview } from '@/lib/quiz/review';
import { SEED_QUESTIONS } from '@/lib/quiz/seed-questions';
import type { ServedQuestion } from '@/lib/database/store';
import type { AttemptAnswer } from '@/types/domain';

/**
 * The participant-facing answer review.
 *
 * These tests exist for one reason: a participant may learn whether they were right and why, but must
 * never be handed the answer key — the next person in the queue is standing behind them, and the same
 * question bank has to survive two days of a busy booth.
 */

const now = '2026-08-06T10:00:00.000Z';

function served(index: number, correct: 'a' | 'b' | 'c' | 'd' = 'b'): ServedQuestion {
  return {
    display_order: index,
    option_order: ['a', 'b', 'c', 'd'],
    question: {
      id: `q-${index}`,
      code: `TQ-${index}`,
      pillar: 'hr_workforce',
      difficulty: 'medium',
      question_text: `Scenario ${index}?`,
      options: [
        { id: 'a', text: `Option A for ${index}` },
        { id: 'b', text: `Option B for ${index}` },
        { id: 'c', text: `Option C for ${index}` },
        { id: 'd', text: `Option D for ${index}` },
      ],
      correct_option_id: correct,
      explanation: `The principle behind ${index}.`,
      active: true,
      review_status: 'approved',
      created_at: now,
      updated_at: now,
    },
  };
}

function answer(index: number, selected: 'a' | 'b' | 'c' | 'd' | null, isCorrect: boolean): AttemptAnswer {
  return {
    attempt_id: 'attempt-1',
    question_id: `q-${index}`,
    selected_option_id: selected,
    answered_offset_ms: 1_000,
    is_correct: isCorrect,
    created_at: now,
  };
}

describe('the participant answer review', () => {
  it('numbers questions from one, in the order they were shown', () => {
    const review = buildParticipantReview(
      [served(2), served(0), served(1)],
      [answer(0, 'b', true), answer(1, 'a', false), answer(2, 'c', false)],
    );

    expect(review.map((item) => item.question_number)).toEqual([1, 2, 3]);
    expect(review.map((item) => item.question_text)).toEqual(['Scenario 0?', 'Scenario 1?', 'Scenario 2?']);
  });

  it('returns the text of the option the participant actually chose', () => {
    const [item] = buildParticipantReview([served(0)], [answer(0, 'c', false)]);
    expect(item?.selected_option_text).toBe('Option C for 0');
    expect(item?.answered).toBe(true);
  });

  it('marks a correct answer correct and still explains the principle', () => {
    const [item] = buildParticipantReview([served(0, 'b')], [answer(0, 'b', true)]);
    expect(item?.is_correct).toBe(true);
    expect(item?.principle).toBe('The principle behind 0.');
  });

  it('reports an unanswered question as not answered rather than as a wrong answer text', () => {
    const [item] = buildParticipantReview([served(0)], [answer(0, null, false)]);
    expect(item?.answered).toBe(false);
    expect(item?.selected_option_text).toBeNull();
    expect(item?.is_correct).toBe(false);
  });

  it('treats a question with no answer row at all as unanswered', () => {
    const [item] = buildParticipantReview([served(0)], []);
    expect(item?.answered).toBe(false);
    expect(item?.selected_option_text).toBeNull();
  });

  it('never emits a correct_option_id', () => {
    const review = buildParticipantReview([served(0, 'd')], [answer(0, 'a', false)]);
    expect(JSON.stringify(review)).not.toContain('correct_option_id');
    for (const item of review) {
      expect(Object.keys(item)).toEqual([
        'question_number',
        'question_text',
        'selected_option_text',
        'answered',
        'is_correct',
        'principle',
      ]);
    }
  });

  it('never leaks the text of an option the participant did not choose', () => {
    // The whole point: the participant picked A and was wrong. D was right. D must not appear.
    const review = buildParticipantReview([served(0, 'd')], [answer(0, 'a', false)]);
    const raw = JSON.stringify(review);

    expect(raw).toContain('Option A for 0');
    expect(raw).not.toContain('Option B for 0');
    expect(raw).not.toContain('Option C for 0');
    expect(raw).not.toContain('Option D for 0');
  });

  it('leaks nothing at all for an unanswered question beyond the principle', () => {
    const raw = JSON.stringify(buildParticipantReview([served(0, 'd')], [answer(0, null, false)]));
    for (const id of ['A', 'B', 'C', 'D']) {
      expect(raw).not.toContain(`Option ${id} for 0`);
    }
  });
});

describe('the seed bank as answer-review material', () => {
  const normalise = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  it('never reproduces the correct option verbatim inside its own explanation', () => {
    // The explanation is shown to a participant who got the question wrong. If it quoted the correct
    // option word for word it would be the answer key with extra steps.
    const offenders = SEED_QUESTIONS.filter((question) => {
      const correct = question.options.find((option) => option.id === question.correct_option_id);
      if (!correct) return false;
      return normalise(question.explanation).includes(normalise(correct.text));
    }).map((question) => question.code);

    expect(offenders).toEqual([]);
  });

  it('gives every question an explanation substantial enough to teach something', () => {
    for (const question of SEED_QUESTIONS) {
      expect(question.explanation.length).toBeGreaterThan(40);
    }
  });
});
