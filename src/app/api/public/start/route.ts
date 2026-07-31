import type { NextRequest } from 'next/server';
import { failure, guarded, ok, validationFailure, NO_STORE_HEADERS } from '@/lib/api/respond';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { getAttemptSigningSecret } from '@/lib/config/env';
import { getStore } from '@/lib/database';
import { SelectionError, selectAttemptQuestions, toParticipantQuestion } from '@/lib/quiz/selection';
import { signAttemptToken, verifyParticipantToken } from '@/lib/security/tokens';
import { logger } from '@/lib/utils/logger';
import { startSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start the challenge.
 *
 * This is the only place the clock starts, and it starts on the database clock, not the browser's.
 * The response carries the questions with `correct_option_id` and `explanation` removed — see
 * `toParticipantQuestion`, which is the single mapper allowed to build a participant-facing question.
 */
export async function POST(request: NextRequest) {
  return guarded('public.start', async () => {
    const store = getStore();
    const settings = await store.getSettings();

    if (settings.quiz_state !== 'active') {
      return failure(
        settings.quiz_state === 'locked' ? 'quiz_locked' : 'quiz_paused',
        settings.quiz_state === 'locked'
          ? 'The challenge is now closed. Thank you for visiting the Outskill booth.'
          : 'The challenge is paused for a moment. Please ask the Outskill team when it reopens.',
        409,
      );
    }

    const rate = await checkRateLimit(store, 'start', request.headers);
    if (!rate.allowed) {
      return failure('rate_limited', 'Please wait a moment and try again.', 429);
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const claims = await verifyParticipantToken(parsed.data.participant_token, getAttemptSigningSecret());
    if (!claims) {
      return failure('invalid_token', 'Your session expired. Please register again to take the challenge.', 401);
    }

    const participant = await store.getParticipant(claims.participantId);
    if (!participant) {
      return failure('invalid_token', 'Your session expired. Please register again to take the challenge.', 401);
    }

    const live = await store.getLiveAttempt(claims.participantId);
    if (!live) {
      return failure(
        'no_attempt',
        'We could not find your challenge entry. Please speak to the Outskill team.',
        409,
      );
    }
    if (live.status === 'submitted' || live.status === 'timed_out') {
      return failure(
        'already_completed',
        'You have already completed the challenge. Please speak to the Outskill team if something went wrong.',
        409,
      );
    }

    // A refresh between "Start" and the first question must resume, not re-roll the questions.
    if (live.status === 'in_progress' && live.started_at && live.deadline_at) {
      return respondWithAttempt(store, live.id, live.participant_id, live.started_at, live.deadline_at, settings.quiz_duration_seconds, true);
    }

    let selected;
    try {
      selected = selectAttemptQuestions(await store.getServeableQuestions(), settings.questions_per_attempt);
    } catch (error) {
      if (error instanceof SelectionError) {
        logger.error('api.error', { context: 'public.start', reason: error.code, detail: error.message });
        return failure(
          'question_pool',
          'The challenge is being set up. Please speak to the Outskill team.',
          503,
        );
      }
      throw error;
    }

    const started = await store.startAttempt(
      claims.participantId,
      settings.quiz_duration_seconds,
      selected.map((entry) => ({
        question_id: entry.question.id,
        display_order: entry.display_order,
        option_order: entry.option_order,
      })),
    );

    logger.info('attempt.started', {
      attemptId: started.attemptId,
      participantId: claims.participantId,
      questionCount: selected.length,
      resumed: started.alreadyStarted,
    });

    if (started.alreadyStarted) {
      return respondWithAttempt(
        store,
        started.attemptId,
        claims.participantId,
        started.startedAt,
        started.deadlineAt,
        settings.quiz_duration_seconds,
        true,
      );
    }

    const token = await signAttemptToken(
      {
        attemptId: started.attemptId,
        participantId: claims.participantId,
        deadlineAtMs: Date.parse(started.deadlineAt),
      },
      getAttemptSigningSecret(),
    );

    return ok(
      {
        attempt_token: token,
        started_at: started.startedAt,
        deadline_at: started.deadlineAt,
        server_now: new Date().toISOString(),
        duration_seconds: settings.quiz_duration_seconds,
        questions: selected.map(toParticipantQuestion),
        resumed: false,
      },
      { headers: NO_STORE_HEADERS },
    );
  });
}

/** Re-issue an attempt token and re-serve the already-persisted question set, in its stored order. */
async function respondWithAttempt(
  store: ReturnType<typeof getStore>,
  attemptId: string,
  participantId: string,
  startedAt: string,
  deadlineAt: string,
  durationSeconds: number,
  resumed: boolean,
) {
  const served = await store.getServedQuestions(attemptId);
  const token = await signAttemptToken(
    { attemptId, participantId, deadlineAtMs: Date.parse(deadlineAt) },
    getAttemptSigningSecret(),
  );

  return ok(
    {
      attempt_token: token,
      started_at: startedAt,
      deadline_at: deadlineAt,
      server_now: new Date().toISOString(),
      duration_seconds: durationSeconds,
      questions: served.map(toParticipantQuestion),
      resumed,
    },
    { headers: NO_STORE_HEADERS },
  );
}
