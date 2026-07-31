import type { NextRequest } from 'next/server';
import { failure, guarded, ok, validationFailure, NO_STORE_HEADERS } from '@/lib/api/respond';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { SUBMISSION_GRACE_MS } from '@/lib/config/constants';
import { getAttemptSigningSecret } from '@/lib/config/env';
import { getStore } from '@/lib/database';
import { buildParticipantReview } from '@/lib/quiz/review';
import { evaluateTiming, formatScoreLabel } from '@/lib/quiz/scoring';
import { verifyAttemptToken } from '@/lib/security/tokens';
import { logger } from '@/lib/utils/logger';
import { submitSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Final submission — the only write the browser makes during a run.
 *
 * Everything authoritative is recomputed here: which questions were served, whether each answer was
 * right, how long the run took, and the resulting rank. The request body contributes exactly one
 * thing: which option was selected for each question.
 *
 * The handler is idempotent. A retry over flaky venue Wi-Fi returns the stored result instead of
 * creating a second attempt or a second score.
 */
export async function POST(request: NextRequest) {
  return guarded('public.submit', async () => {
    const receivedAtMs = Date.now();
    const store = getStore();

    const rate = await checkRateLimit(store, 'submit', request.headers);
    if (!rate.allowed) {
      return failure('rate_limited', 'Please wait a moment and try again.', 429);
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const claims = await verifyAttemptToken(parsed.data.attempt_token, getAttemptSigningSecret());
    if (!claims) {
      return failure('invalid_token', 'We could not verify this challenge. Please speak to the Outskill team.', 401);
    }

    const attempt = await store.getAttempt(claims.attemptId);
    if (!attempt) {
      return failure('not_found', 'We could not find this challenge. Please speak to the Outskill team.', 404);
    }

    // The token must belong to this attempt's participant; a token from another run is not enough.
    if (attempt.participant_id !== claims.participantId) {
      logger.warn('api.error', { context: 'public.submit', reason: 'participant_mismatch', attemptId: attempt.id });
      return failure('invalid_token', 'We could not verify this challenge. Please speak to the Outskill team.', 403);
    }

    // Already finished: return the stored result rather than an error, so a duplicate retry looks
    // exactly like a successful first submission to the participant.
    if (attempt.status === 'submitted' || attempt.status === 'timed_out') {
      logger.info('attempt.duplicate_submit', { attemptId: attempt.id });
      return respond(store, attempt.id, attempt.correct_count ?? 0, attempt.elapsed_ms ?? 0, attempt.status === 'timed_out');
    }

    if (attempt.status !== 'in_progress' || !attempt.started_at || !attempt.deadline_at) {
      return failure(
        'not_started',
        'This challenge was never started. Please speak to the Outskill team.',
        409,
      );
    }

    const timing = evaluateTiming({
      startedAtMs: Date.parse(attempt.started_at),
      deadlineAtMs: Date.parse(attempt.deadline_at),
      receivedAtMs,
      graceMs: SUBMISSION_GRACE_MS,
    });

    const timedOut = timing.outcome === 'timed_out';

    // Answers are recorded for questions actually served to this attempt; the store drops anything
    // else, so a crafted payload cannot answer a question the participant never saw.
    const finalised = await store.finaliseAttempt(
      attempt.id,
      parsed.data.answers.map((answer) => ({
        question_id: answer.question_id,
        selected_option_id: answer.selected_option_id,
        answered_offset_ms: answer.answered_offset_ms,
      })),
      timing.elapsed_ms,
      timedOut,
    );

    logger.info(timedOut ? 'attempt.timed_out' : 'attempt.submitted', {
      attemptId: attempt.id,
      correctCount: finalised.correctCount,
      elapsedMs: finalised.elapsedMs,
      withinGrace: timing.outcome === 'accepted' ? timing.within_grace : false,
      alreadyFinal: finalised.alreadyFinal,
    });

    return respond(store, attempt.id, finalised.correctCount, finalised.elapsedMs, finalised.status === 'timed_out');
  });
}

async function respond(
  store: ReturnType<typeof getStore>,
  attemptId: string,
  correctCount: number,
  elapsedMs: number,
  timedOut: boolean,
) {
  const settings = await store.getSettings();
  const [rank, attempt, served, answers] = await Promise.all([
    store.getRank(attemptId),
    store.getAttempt(attemptId),
    store.getServedQuestions(attemptId),
    store.getAttemptAnswers(attemptId),
  ]);

  const inTopN = rank !== null && rank <= settings.leaderboard_size;

  return ok(
    {
      correct_count: correctCount,
      total_questions: settings.questions_per_attempt,
      elapsed_ms: elapsedMs,
      score_label: formatScoreLabel(correctCount, elapsedMs, settings.questions_per_attempt),
      rank,
      timed_out: timedOut,
      in_top_n: inTopN,
      top_n: settings.leaderboard_size,
      verified: attempt?.verified_at != null,
      spin_cta_text: settings.spin_cta_text,
      result_review_seconds: settings.result_auto_reset_seconds,
      // Built by the one mapper that is allowed to decide what a participant may see. It carries no
      // correct_option_id and no unselected option text, so the answer key never reaches the tablet.
      review: buildParticipantReview(served, answers),
    },
    { headers: NO_STORE_HEADERS },
  );
}
