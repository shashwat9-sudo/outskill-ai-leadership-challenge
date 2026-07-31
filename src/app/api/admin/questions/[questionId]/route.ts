import type { NextRequest } from 'next/server';
import { failure, guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { logger } from '@/lib/utils/logger';
import { questionWriteSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ questionId: string }> }) {
  return guarded('admin.questions.read', async () => {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { questionId } = await context.params;
    const question = await getStore().getQuestion(questionId);
    if (!question) return failure('not_found', 'That question no longer exists.', 404);
    return ok({ question });
  });
}

/**
 * Edit a question. Deactivating (`active: false`) is how a question is archived — rows are never
 * deleted, because an archived question may still be referenced by attempts already on the leaderboard.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ questionId: string }> }) {
  return guarded('admin.questions.update', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const { questionId } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const parsed = questionWriteSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const question = await store.updateQuestion(questionId, parsed.data);

    logger.info(question.active ? 'question.updated' : 'question.archived', {
      questionId: question.id,
      code: question.code,
      actor: guard.actor,
    });
    await store.recordAudit({
      action: question.active ? 'question.updated' : 'question.archived',
      target_type: 'question',
      target_id: question.id,
      detail: { code: question.code, active: question.active, review_status: question.review_status },
      actor_label: guard.actor,
    });

    return ok({ question });
  });
}
