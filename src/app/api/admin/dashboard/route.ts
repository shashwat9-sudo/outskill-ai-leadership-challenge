import type { NextRequest } from 'next/server';
import { guarded, ok } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { checkEnvironment } from '@/lib/config/env';
import { getStore } from '@/lib/database';
import { describePoolHealth } from '@/lib/quiz/selection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return guarded('admin.dashboard', async () => {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const store = getStore();
    const [metrics, settings, questions] = await Promise.all([
      store.getDashboardMetrics(),
      store.getSettings(),
      store.listQuestions(),
    ]);

    return ok({
      metrics,
      settings,
      pool_health: describePoolHealth(questions, settings.questions_per_attempt),
      environment: checkEnvironment(),
      store_kind: store.kind,
    });
  });
}
