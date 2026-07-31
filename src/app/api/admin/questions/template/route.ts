import type { NextRequest } from 'next/server';
import { unexpectedFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { questionCsvTemplate } from '@/lib/quiz/question-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Downloadable CSV template, pre-filled with one worked example row. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    return new Response(questionCsvTemplate(), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="outskill-question-template.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return unexpectedFailure(error, 'admin.questions.template');
  }
}
