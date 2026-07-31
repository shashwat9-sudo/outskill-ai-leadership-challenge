/**
 * Seed a live Supabase project with the settings row and the 60 questions.
 *
 *   npm run seed
 *
 * This talks to Supabase directly with the secret key from .env.local, so it needs SUPABASE_URL and
 * SUPABASE_SECRET_KEY. It is idempotent: settings are only created if missing, and questions are
 * matched on their `code`, so re-running updates rather than duplicating.
 *
 * If you prefer not to run a script at all, paste supabase/seed.sql into the Supabase SQL Editor —
 * it does exactly the same thing.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS } from '../src/lib/config/constants';
import { SEED_QUESTIONS } from '../src/lib/quiz/seed-questions';

/** Minimal .env.local reader — avoids adding a dependency for one script. */
function loadEnvFile(): void {
  try {
    const contents = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of contents.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1];
      const value = match[2]?.replace(/^["']|["']$/g, '') ?? '';
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // No .env.local — the variables may already be exported in the shell.
  }
}

async function main(): Promise<void> {
  loadEnvFile();

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !key) {
    console.error(
      '\nMissing SUPABASE_URL or SUPABASE_SECRET_KEY.\n\n' +
        'Create a file called .env.local (copy .env.example) and fill in both values, then run this again.\n' +
        'You can find them in Supabase → Project Settings → Data API and → API Keys.\n',
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('Seeding event settings…');
  const { data: existing, error: readError } = await supabase
    .from('app_settings')
    .select('id')
    .eq('id', 'singleton')
    .maybeSingle();

  if (readError) {
    console.error(`Could not read app_settings: ${readError.message}`);
    console.error('Have you run supabase/migrations/0001_schema.sql and 0002_functions.sql yet?');
    process.exitCode = 1;
    return;
  }

  if (existing) {
    console.log('  Settings row already exists — leaving it untouched.');
  } else {
    const { error } = await supabase.from('app_settings').insert({ id: 'singleton', ...DEFAULT_SETTINGS });
    if (error) {
      console.error(`  Failed: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log('  Created.');
  }

  console.log(`Seeding ${SEED_QUESTIONS.length} questions…`);
  const rows = SEED_QUESTIONS.map((question) => ({
    code: question.code,
    pillar: question.pillar,
    difficulty: question.difficulty,
    question_text: question.question_text,
    options: question.options,
    correct_option_id: question.correct_option_id,
    explanation: question.explanation,
    active: question.active,
    review_status: question.review_status,
  }));

  const { error: upsertError } = await supabase.from('questions').upsert(rows, { onConflict: 'code' });
  if (upsertError) {
    console.error(`  Failed: ${upsertError.message}`);
    process.exitCode = 1;
    return;
  }

  const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true });

  console.log(`  Done. The question bank now holds ${count ?? 'an unknown number of'} questions.`);
  console.log(
    '\nNext: open /admin/questions, read the seeded questions, and promote them from "reviewed" to ' +
      '"approved" once the event owner has signed them off.\n',
  );
}

void main();
