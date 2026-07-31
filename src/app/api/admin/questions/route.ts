import type { NextRequest } from 'next/server';
import { failure, guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { StoreError } from '@/lib/database/store';
import { describePoolHealth, summariseQuestionBank } from '@/lib/quiz/selection';
import { logger } from '@/lib/utils/logger';
import { questionFilterSchema, questionWriteSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return guarded('admin.questions.list', async () => {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const parsed = questionFilterSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const settings = await store.getSettings();
    const questions = await store.listQuestions({
      q: parsed.data.q,
      pillar: parsed.data.pillar,
      difficulty: parsed.data.difficulty,
      review_status: parsed.data.review_status,
      active: parsed.data.active === undefined ? undefined : parsed.data.active === 'true',
    });
    const all = parsed.data.q || parsed.data.pillar || parsed.data.difficulty || parsed.data.active || parsed.data.review_status
      ? await store.listQuestions()
      : questions;

    return ok({
      questions,
      total: all.length,
      pool_health: describePoolHealth(all, settings.questions_per_attempt),
      // Always describes the whole bank, never the current filter — see summariseQuestionBank.
      summary: summariseQuestionBank(all),
    });
  });
}

export async function POST(request: NextRequest) {
  return guarded('admin.questions.create', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const body: unknown = await request.json().catch(() => null);
    const parsed = questionWriteSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    try {
      const question = await store.createQuestion(parsed.data);
      logger.info('question.created', { questionId: question.id, code: question.code, actor: guard.actor });
      await store.recordAudit({
        action: 'question.created',
        target_type: 'question',
        target_id: question.id,
        detail: { code: question.code },
        actor_label: guard.actor,
      });
      return ok({ question });
    } catch (error) {
      if (error instanceof StoreError && error.code === 'duplicate_code') {
        return failure('duplicate_code', error.message, 409, { fields: { code: error.message } });
      }
      throw error;
    }
  });
}
