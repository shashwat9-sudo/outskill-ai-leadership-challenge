import type { AttemptAnswer } from '@/types/domain';
import type { ServedQuestion } from '@/lib/database/store';

/**
 * The participant-facing answer review.
 *
 * This is the second of the two mappers that stand between stored questions and a participant's
 * browser (the first is `toParticipantQuestion`, used while the challenge is running). Everything the
 * answer key consists of is dropped here, deliberately and in one place:
 *
 *  - `correct_option_id` is never emitted, for right or wrong answers
 *  - the other three option texts are never emitted, so nothing can be highlighted as "the right one"
 *  - only the option the participant actually chose is returned
 *
 * A participant therefore learns whether they were right and which principle applies, but cannot
 * reconstruct the answer key — which matters when the next person in the queue is watching over a
 * shoulder, and when the same question bank has to survive two days of a busy booth.
 *
 * The admin inspector is unaffected: it has its own route and still shows the full key.
 */
export type ParticipantReviewItem = {
  /** 1-based, matching the "Question 3 of 7" numbering the participant saw during the run. */
  question_number: number;
  question_text: string;
  /** The text of the option the participant chose, or null when they never answered. */
  selected_option_text: string | null;
  answered: boolean;
  is_correct: boolean;
  /** The decision-making principle behind the question. Never the correct option verbatim. */
  principle: string;
};

export function buildParticipantReview(
  served: readonly ServedQuestion[],
  answers: readonly AttemptAnswer[],
): ParticipantReviewItem[] {
  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));

  return [...served]
    .sort((left, right) => left.display_order - right.display_order)
    .map((entry, index) => {
      const answer = answerByQuestion.get(entry.question.id);
      const selectedId = answer?.selected_option_id ?? null;
      const selected = selectedId
        ? (entry.question.options.find((option) => option.id === selectedId) ?? null)
        : null;

      return {
        question_number: index + 1,
        question_text: entry.question.question_text,
        selected_option_text: selected?.text ?? null,
        answered: selected !== null,
        is_correct: answer?.is_correct === true,
        principle: entry.question.explanation,
      };
    });
}
