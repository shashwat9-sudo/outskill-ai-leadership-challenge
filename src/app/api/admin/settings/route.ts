import type { NextRequest } from 'next/server';
import { guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { checkEnvironment } from '@/lib/config/env';
import { getStore } from '@/lib/database';
import { describePoolHealth } from '@/lib/quiz/selection';
import { logger } from '@/lib/utils/logger';
import { settingsUpdateSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return guarded('admin.settings.read', async () => {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const store = getStore();
    const settings = await store.getSettings();
    const questions = await store.listQuestions();

    return ok({
      settings,
      pool_health: describePoolHealth(questions, settings.questions_per_attempt),
      environment: checkEnvironment(),
      store_kind: store.kind,
    });
  });
}

export async function PATCH(request: NextRequest) {
  return guarded('admin.settings.update', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const body: unknown = await request.json().catch(() => null);
    const parsed = settingsUpdateSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const current = await store.getSettings();

    // quiz_state is not editable here — it changes only through the audited start/pause/lock control.
    const updated = await store.updateSettings({ ...parsed.data, quiz_state: current.quiz_state });

    logger.info('settings.updated', {
      actor: guard.actor,
      questionsPerAttempt: updated.questions_per_attempt,
      durationSeconds: updated.quiz_duration_seconds,
    });
    await store.recordAudit({
      action: 'settings.updated',
      target_type: 'app_settings',
      target_id: null,
      detail: {
        questions_per_attempt: updated.questions_per_attempt,
        quiz_duration_seconds: updated.quiz_duration_seconds,
        leaderboard_size: updated.leaderboard_size,
      },
      actor_label: guard.actor,
    });

    const questions = await store.listQuestions();
    return ok({
      settings: updated,
      pool_health: describePoolHealth(questions, updated.questions_per_attempt),
    });
  });
}
