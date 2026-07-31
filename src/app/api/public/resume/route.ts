import type { NextRequest } from 'next/server';
import { failure, guarded, ok, validationFailure, NO_STORE_HEADERS } from '@/lib/api/respond';
import { getAttemptSigningSecret } from '@/lib/config/env';
import { getStore } from '@/lib/database';
import { buildParticipantReview } from '@/lib/quiz/review';
import { formatScoreLabel } from '@/lib/quiz/scoring';
import { toParticipantQuestion } from '@/lib/quiz/selection';
import { verifyAttemptToken } from '@/lib/security/tokens';
import { logger } from '@/lib/utils/logger';
import { resumeSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Recover an in-flight attempt after a refresh, a crash or a tablet reload.
 *
 * The browser keeps its answers in sessionStorage, but the deadline and the question set are read
 * back from the server so a participant cannot gain time by reloading. An attempt that has already
 * finished returns its result instead, so a reload on the results page still shows the score.
 */
export async function GET(request: NextRequest) {
  return guarded('public.resume', async () => {
    const parsed = resumeSchema.safeParse({ attempt_token: request.nextUrl.searchParams.get('attempt_token') ?? '' });
    if (!parsed.success) return validationFailure(parsed.error);

    const claims = await verifyAttemptToken(parsed.data.attempt_token, getAttemptSigningSecret());
    if (!claims) {
      return failure('invalid_token', 'This challenge session has expired.', 401);
    }

    const store = getStore();
    const attempt = await store.getAttempt(claims.attemptId);
    if (!attempt || attempt.participant_id !== claims.participantId) {
      return failure('not_found', 'We could not find this challenge.', 404);
    }

    const settings = await store.getSettings();

    if (attempt.status === 'submitted' || attempt.status === 'timed_out') {
      const [rank, served, answers] = await Promise.all([
        store.getRank(attempt.id),
        store.getServedQuestions(attempt.id),
        store.getAttemptAnswers(attempt.id),
      ]);
      return ok(
        {
          state: 'completed' as const,
          correct_count: attempt.correct_count ?? 0,
          total_questions: settings.questions_per_attempt,
          elapsed_ms: attempt.elapsed_ms ?? 0,
          score_label: formatScoreLabel(
            attempt.correct_count ?? 0,
            attempt.elapsed_ms ?? 0,
            settings.questions_per_attempt,
          ),
          rank,
          in_top_n: rank !== null && rank <= settings.leaderboard_size,
          top_n: settings.leaderboard_size,
          verified: attempt.verified_at != null,
          timed_out: attempt.status === 'timed_out',
          spin_cta_text: settings.spin_cta_text,
          result_review_seconds: settings.result_auto_reset_seconds,
          review: buildParticipantReview(served, answers),
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    if (attempt.status !== 'in_progress' || !attempt.started_at || !attempt.deadline_at) {
      return failure('not_resumable', 'This challenge cannot be resumed. Please speak to the Outskill team.', 409);
    }

    const served = await store.getServedQuestions(attempt.id);
    logger.info('attempt.resumed', { attemptId: attempt.id });

    return ok(
      {
        state: 'in_progress' as const,
        started_at: attempt.started_at,
        deadline_at: attempt.deadline_at,
        server_now: new Date().toISOString(),
        duration_seconds: settings.quiz_duration_seconds,
        questions: served.map(toParticipantQuestion),
      },
      { headers: NO_STORE_HEADERS },
    );
  });
}
