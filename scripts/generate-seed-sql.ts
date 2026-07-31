/**
 * Generate `supabase/seed.sql` from the TypeScript question bank.
 *
 * The TypeScript file is the single source of truth for the 60 seed questions. Regenerating keeps the
 * SQL and the demo store from ever drifting apart.
 *
 *   npm run seed:sql
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_SETTINGS } from '../src/lib/config/constants';
import { SEED_QUESTIONS } from '../src/lib/quiz/seed-questions';

/** Escape a value for a single-quoted SQL string literal. */
function sql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonLiteral(value: unknown): string {
  return `${sql(JSON.stringify(value))}::jsonb`;
}

const questionRows = SEED_QUESTIONS.map((question) =>
  [
    sql(question.code),
    sql(question.pillar),
    sql(question.difficulty),
    sql(question.question_text),
    jsonLiteral(question.options),
    sql(question.correct_option_id),
    sql(question.explanation),
    question.active ? 'true' : 'false',
    sql(question.review_status),
  ].join(', '),
).map((row) => `  (${row})`);

const settings = DEFAULT_SETTINGS;

const output = `-- =============================================================================================
-- seed.sql — GENERATED FILE, DO NOT EDIT BY HAND
--
-- Source of truth: src/lib/quiz/seed-questions.ts and src/lib/config/constants.ts
-- Regenerate with:  npm run seed:sql
--
-- Run this after 0001_schema.sql and 0002_functions.sql.
-- It is safe to run more than once: settings are upserted and questions are matched on their code.
--
-- REVIEW NOTE: all 120 questions are seeded active and 'approved' so the bank is servable straight
-- away. Read them in /admin/questions before the event and edit anything you want to reword.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Event settings (single row)
-- ---------------------------------------------------------------------------------------------

insert into app_settings (
  id, quiz_title, hook_text, supporting_line, event_name, event_location,
  event_start_at, event_end_at, winner_announcement_at, quiz_state,
  quiz_duration_seconds, questions_per_attempt, leaderboard_size,
  result_auto_reset_seconds, leaderboard_refresh_seconds,
  prize_first, prize_second, prize_third, spin_cta_text, qr_caption,
  privacy_contact_text, privacy_notice_text, rules_text
) values (
  'singleton',
  ${sql(settings.quiz_title)},
  ${sql(settings.hook_text)},
  ${sql(settings.supporting_line)},
  ${sql(settings.event_name)},
  ${sql(settings.event_location)},
  ${sql(settings.event_start_at)}::timestamptz,
  ${sql(settings.event_end_at)}::timestamptz,
  ${sql(settings.winner_announcement_at)}::timestamptz,
  ${sql(settings.quiz_state)},
  ${settings.quiz_duration_seconds},
  ${settings.questions_per_attempt},
  ${settings.leaderboard_size},
  ${settings.result_auto_reset_seconds},
  ${settings.leaderboard_refresh_seconds},
  ${sql(settings.prize_first)},
  ${sql(settings.prize_second)},
  ${sql(settings.prize_third)},
  ${sql(settings.spin_cta_text)},
  ${sql(settings.qr_caption)},
  ${sql(settings.privacy_contact_text)},
  ${sql(settings.privacy_notice_text)},
  ${sql(settings.rules_text)}
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Question bank — ${SEED_QUESTIONS.length} questions
-- ---------------------------------------------------------------------------------------------

insert into questions (
  code, pillar, difficulty, question_text, options, correct_option_id, explanation, active, review_status
) values
${questionRows.join(',\n')}
on conflict (code) do update set
  pillar            = excluded.pillar,
  difficulty        = excluded.difficulty,
  question_text     = excluded.question_text,
  options           = excluded.options,
  correct_option_id = excluded.correct_option_id,
  explanation       = excluded.explanation,
  active            = excluded.active,
  review_status     = excluded.review_status;
`;

const target = resolve(process.cwd(), 'supabase/seed.sql');
writeFileSync(target, output, 'utf8');

console.log(`Wrote ${SEED_QUESTIONS.length} questions and the settings row to supabase/seed.sql`);
