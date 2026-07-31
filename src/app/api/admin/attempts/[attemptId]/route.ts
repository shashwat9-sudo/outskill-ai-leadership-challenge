import type { NextRequest } from 'next/server';
import { failure, guarded, ok } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Full inspection of one attempt: the exact questions served, in the exact order, alongside what the
 * participant selected and what was correct. This is what a verification or a dispute is settled with.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return guarded('admin.attempts.detail', async () => {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { attemptId } = await context.params;
    const store = getStore();

    const attempt = await store.getAttempt(attemptId);
    if (!attempt) return failure('not_found', 'That attempt no longer exists.', 404);

    const [participant, served, answers, audit, rank] = await Promise.all([
      store.getParticipant(attempt.participant_id),
      store.getServedQuestions(attemptId),
      store.getAttemptAnswers(attemptId),
      store.listAudit(50, attemptId),
      store.getRank(attemptId),
    ]);

    const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));

    return ok({
      attempt,
      participant,
      rank,
      audit,
      questions: served.map((entry) => {
        const answer = answerByQuestion.get(entry.question.id);
        return {
          display_order: entry.display_order,
          code: entry.question.code,
          pillar: entry.question.pillar,
          difficulty: entry.question.difficulty,
          question_text: entry.question.question_text,
          options: entry.option_order.flatMap((optionId) => {
            const option = entry.question.options.find((candidate) => candidate.id === optionId);
            return option ? [option] : [];
          }),
          correct_option_id: entry.question.correct_option_id,
          explanation: entry.question.explanation,
          selected_option_id: answer?.selected_option_id ?? null,
          answered_offset_ms: answer?.answered_offset_ms ?? null,
          is_correct: answer?.is_correct ?? false,
        };
      }),
    });
  });
}
