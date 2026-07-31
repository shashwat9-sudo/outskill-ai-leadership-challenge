import type { NextRequest } from 'next/server';
import { guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { parseQuestionCsv } from '@/lib/quiz/question-import';
import { logger } from '@/lib/utils/logger';
import { questionImportSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * CSV question import.
 *
 * Always parses and reports first. With `commit: false` nothing is written, which lets an organiser
 * fix a spreadsheet before touching the live bank. Invalid rows are never written, even on commit —
 * a partial import of the valid rows is far better than rejecting a 200-row file over one typo.
 */
export async function POST(request: NextRequest) {
  return guarded('admin.questions.import', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const body: unknown = await request.json().catch(() => null);
    const parsed = questionImportSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const report = parseQuestionCsv(parsed.data.csv);

    if (!parsed.data.commit) {
      return ok({
        committed: false,
        valid_count: report.valid.length,
        error_count: report.errors.length,
        errors: report.errors,
        preview: report.valid.slice(0, 10),
      });
    }

    const store = getStore();
    const result = await store.importQuestions(report.valid);

    logger.info('questions.imported', {
      inserted: result.inserted,
      updated: result.updated,
      rejected: report.errors.length,
      actor: guard.actor,
    });
    await store.recordAudit({
      action: 'questions.imported',
      target_type: 'question',
      target_id: null,
      detail: { inserted: result.inserted, updated: result.updated, rejected: report.errors.length },
      actor_label: guard.actor,
    });

    return ok({
      committed: true,
      inserted: result.inserted,
      updated: result.updated,
      error_count: report.errors.length,
      errors: report.errors,
    });
  });
}
