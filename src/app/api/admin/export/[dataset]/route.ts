import type { NextRequest } from 'next/server';
import { failure, unexpectedFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { PILLAR_LABELS } from '@/lib/config/constants';
import { getStore } from '@/lib/database';
import { formatElapsed } from '@/lib/quiz/scoring';
import { buildPublicName } from '@/lib/utils/identity';
import { toCsv } from '@/lib/utils/csv';
import { formatExportTimestamp } from '@/lib/utils/time';
import { logger } from '@/lib/utils/logger';
import { QUESTION_CSV_COLUMNS } from '@/lib/quiz/question-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATASETS = ['participants', 'attempts', 'leaderboard', 'questions'] as const;
type Dataset = (typeof DATASETS)[number];

function isDataset(value: string): value is Dataset {
  return (DATASETS as readonly string[]).includes(value);
}

function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * CSV exports for the event team.
 *
 * `participants` is the lead list and contains contact details — it is behind the admin session and
 * is the only export that does. `leaderboard` is the public-safe version with masked names, suitable
 * for sharing outside the team.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ dataset: string }> }): Promise<Response> {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { dataset } = await context.params;
    if (!isDataset(dataset)) {
      return failure('unknown_dataset', `Unknown export. Choose one of: ${DATASETS.join(', ')}.`, 404);
    }

    const store = getStore();
    const settings = await store.getSettings();
    const stamp = new Date().toISOString().slice(0, 10);

    logger.info('csv.exported', { dataset, actor: guard.actor });
    await store.recordAudit({
      action: 'csv.exported',
      target_type: 'export',
      target_id: null,
      detail: { dataset },
      actor_label: guard.actor,
    });

    if (dataset === 'participants') {
      // Rank lives on the ranked attempt view, so it is joined in here rather than duplicated into a
      // second ranking query inside the participant export.
      const [rows, ranked] = await Promise.all([store.exportParticipants(), store.exportAttempts()]);
      const rankByAttempt = new Map(ranked.map((row) => [row.attempt_id, row.rank]));

      return csvResponse(
        `outskill-challenge-leads-${stamp}.csv`,
        toCsv(
          [
            'participant_id', 'full_name', 'email', 'phone_e164', 'phone_as_entered',
            'company_name', 'designation',
            'registered_at_utc', 'registered_at_ist',
            'submitted_at_utc', 'submitted_at_ist',
            'score', 'questions_attempted', 'questions_correct',
            'completion_time_ms', 'completion_time_seconds', 'rank',
            'public_leaderboard_consent', 'marketing_consent',
            'attempt_status', 'verified', 'verified_at_utc',
            'disqualified', 'disqualification_reason',
          ],
          rows.map((row) => {
            const rank = row.attempt_id ? (rankByAttempt.get(row.attempt_id) ?? '') : '';
            return [
              row.id, row.full_name, row.email, row.phone_e164, row.phone_original,
              row.company_name ?? '', row.designation ?? '',
              row.created_at, formatExportTimestamp(row.created_at),
              row.submitted_at ?? '', formatExportTimestamp(row.submitted_at),
              row.correct_count ?? '', row.questions_attempted, row.correct_count ?? '',
              row.elapsed_ms ?? '',
              row.elapsed_ms === null ? '' : formatElapsed(row.elapsed_ms),
              rank,
              row.public_leaderboard_opt_in, row.marketing_opt_in,
              row.attempt_status ?? '', row.verified, row.verified_at ?? '',
              row.disqualified, row.disqualification_reason ?? '',
            ];
          }),
        ),
      );
    }

    if (dataset === 'attempts') {
      const rows = await store.exportAttempts();
      return csvResponse(
        `outskill-challenge-attempts-${stamp}.csv`,
        toCsv(
          [
            'rank', 'attempt_id', 'participant_id', 'full_name', 'email', 'phone_e164',
            'status', 'correct_count', 'total_questions', 'completion_time_seconds', 'completion_time_ms',
            'submitted_at_utc', 'submitted_at_ist', 'public_leaderboard_consent', 'marketing_consent',
            'verified', 'verified_at_utc', 'disqualified', 'disqualified_at_utc', 'disqualification_reason',
          ],
          rows.map((row) => [
            row.rank || '', row.attempt_id, row.participant_id, row.full_name, row.email, row.phone_e164,
            row.status, row.correct_count, settings.questions_per_attempt, formatElapsed(row.elapsed_ms), row.elapsed_ms,
            row.submitted_at, formatExportTimestamp(row.submitted_at),
            row.public_leaderboard_opt_in, row.marketing_opt_in,
            row.verified, row.verified_at ?? '',
            row.disqualified_at != null, row.disqualified_at ?? '', row.disqualification_reason ?? '',
          ]),
        ),
      );
    }

    if (dataset === 'leaderboard') {
      const rows = await store.getLeaderboard(1000);
      return csvResponse(
        `outskill-challenge-leaderboard-${stamp}.csv`,
        toCsv(
          ['rank', 'display_name', 'correct_count', 'total_questions', 'completion_time', 'verified', 'submitted_at'],
          rows.map((row) => [
            row.rank,
            buildPublicName(row.full_name, row.public_leaderboard_opt_in, row.public_number),
            row.correct_count,
            settings.questions_per_attempt,
            formatElapsed(row.elapsed_ms),
            row.verified,
            row.submitted_at,
          ]),
        ),
      );
    }

    const questions = await store.listQuestions();
    return csvResponse(
      `outskill-challenge-questions-${stamp}.csv`,
      toCsv([...QUESTION_CSV_COLUMNS, 'pillar_label'], questions.map((question) => {
        const optionText = (id: string) => question.options.find((option) => option.id === id)?.text ?? '';
        return [
          question.code, question.pillar, question.difficulty, question.question_text,
          optionText('a'), optionText('b'), optionText('c'), optionText('d'),
          question.correct_option_id, question.explanation, question.active, question.review_status,
          PILLAR_LABELS[question.pillar],
        ];
      })),
    );
  } catch (error) {
    return unexpectedFailure(error, 'admin.export');
  }
}
