import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  attempt_id: z.string().uuid(),
  verified: z.boolean(),
});

/**
 * Mark a top-10 entry as verified in person, or remove that verification.
 * Only a verified, non-disqualified attempt can become the final prize winner.
 */
export async function POST(request: NextRequest) {
  return guarded('admin.attempts.verify', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const body: unknown = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const attempt = await store.setVerification(parsed.data.attempt_id, parsed.data.verified, guard.actor);

    logger.info(parsed.data.verified ? 'attempt.verified' : 'attempt.verification_removed', {
      attemptId: attempt.id,
      actor: guard.actor,
    });
    await store.recordAudit({
      action: parsed.data.verified ? 'attempt.verified' : 'attempt.verification_removed',
      target_type: 'attempt',
      target_id: attempt.id,
      detail: { verified: parsed.data.verified },
      actor_label: guard.actor,
    });

    return ok({ attempt });
  });
}
