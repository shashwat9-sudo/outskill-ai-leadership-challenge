import type { NextRequest } from 'next/server';
import { guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { attemptSearchSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The admin leaderboard: full detail, including contact details, for verification at the desk. */
export async function GET(request: NextRequest) {
  return guarded('admin.attempts.search', async () => {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const parsed = attemptSearchSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const settings = await store.getSettings();
    const rows = await store.searchAttempts(parsed.data.q, parsed.data.status, parsed.data.limit ?? 200);

    return ok({
      attempts: rows,
      questions_per_attempt: settings.questions_per_attempt,
      leaderboard_size: settings.leaderboard_size,
    });
  });
}
