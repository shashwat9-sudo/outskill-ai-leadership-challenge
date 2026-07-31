import type { NextRequest } from 'next/server';
import { guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { logger } from '@/lib/utils/logger';
import { participantResetSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Recovery after a genuine technical failure (a frozen tablet, a dead Wi-Fi link mid-run).
 *
 * Nothing is deleted. The previous attempt is invalidated — which removes it from the leaderboard and
 * frees the one-live-attempt constraint — and a single replacement attempt is created that points back
 * at the original, so the history of what happened is preserved for any prize dispute.
 */
export async function POST(request: NextRequest) {
  return guarded('admin.participants.reset', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const body: unknown = await request.json().catch(() => null);
    const parsed = participantResetSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const result = await store.resetParticipant(parsed.data.participant_id, parsed.data.reason);

    logger.info('participant.reset', {
      participantId: parsed.data.participant_id,
      newAttemptId: result.newAttemptId,
      invalidatedAttemptId: result.invalidatedAttemptId ?? 'none',
      actor: guard.actor,
    });

    return ok({
      new_attempt_id: result.newAttemptId,
      invalidated_attempt_id: result.invalidatedAttemptId,
    });
  });
}
