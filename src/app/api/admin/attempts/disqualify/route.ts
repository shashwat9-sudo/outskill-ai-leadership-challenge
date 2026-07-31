import type { NextRequest } from 'next/server';
import { guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { logger } from '@/lib/utils/logger';
import { disqualifySchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Disqualify an entry. A reason is mandatory — the audit trail has to survive a prize dispute. */
export async function POST(request: NextRequest) {
  return guarded('admin.attempts.disqualify', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const body: unknown = await request.json().catch(() => null);
    const parsed = disqualifySchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const attempt = await store.disqualifyAttempt(parsed.data.attempt_id, parsed.data.reason, guard.actor);

    logger.info('attempt.disqualified', { attemptId: attempt.id, actor: guard.actor });
    await store.recordAudit({
      action: 'attempt.disqualified',
      target_type: 'attempt',
      target_id: attempt.id,
      detail: { reason: parsed.data.reason },
      actor_label: guard.actor,
    });

    return ok({ attempt });
  });
}
