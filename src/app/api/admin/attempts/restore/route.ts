import type { NextRequest } from 'next/server';
import { guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { logger } from '@/lib/utils/logger';
import { attemptActionSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Undo a disqualification, returning the attempt to the leaderboard. */
export async function POST(request: NextRequest) {
  return guarded('admin.attempts.restore', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const body: unknown = await request.json().catch(() => null);
    const parsed = attemptActionSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const attempt = await store.restoreAttempt(parsed.data.attempt_id, guard.actor);

    logger.info('attempt.restored', { attemptId: attempt.id, actor: guard.actor });
    return ok({ attempt });
  });
}
