import type { NextRequest } from 'next/server';
import { failure, guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { logger } from '@/lib/utils/logger';
import { quizStateSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start / pause / lock.
 *
 * Locking ends the event: no further registrations or attempts. Unlocking an already-locked event is
 * treated as a dangerous action — both directions require the operator to type an exact phrase, which
 * the UI shows them, so neither can happen from a mis-tap on a busy booth tablet.
 */
export const LOCK_CONFIRMATION = 'LOCK THE CHALLENGE';
export const UNLOCK_CONFIRMATION = 'UNLOCK THE CHALLENGE';

export async function POST(request: NextRequest) {
  return guarded('admin.quiz_state', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const body: unknown = await request.json().catch(() => null);
    const parsed = quizStateSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const current = await store.getSettings();
    const next = parsed.data.quiz_state;

    if (next === 'locked' && parsed.data.confirmation !== LOCK_CONFIRMATION) {
      return failure(
        'confirmation_required',
        `Type "${LOCK_CONFIRMATION}" to confirm. Locking stops all new registrations and attempts.`,
        400,
      );
    }

    if (current.quiz_state === 'locked' && next !== 'locked' && parsed.data.confirmation !== UNLOCK_CONFIRMATION) {
      return failure(
        'confirmation_required',
        `This event is locked. Type "${UNLOCK_CONFIRMATION}" to reopen it. Only do this if the lock was a mistake.`,
        400,
      );
    }

    const result = await store.setQuizState(next, guard.actor);

    if (next === 'locked') logger.info('quiz.locked', { actor: guard.actor });
    else if (next === 'paused') logger.info('quiz.paused', { actor: guard.actor });
    else if (current.quiz_state === 'locked') logger.info('quiz.unlocked', { actor: guard.actor });
    else logger.info('quiz.started', { actor: guard.actor });

    return ok({ quiz_state: result, previous_state: current.quiz_state });
  });
}
