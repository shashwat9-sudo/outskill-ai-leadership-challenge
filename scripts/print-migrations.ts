/**
 * Print every migration and the seed file in the order they must be run.
 *
 *   npm run migrate:print
 *
 * Useful when you would rather paste SQL into the Supabase SQL Editor than install extra tooling —
 * which is the path the setup guide recommends for a first-time project owner.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

console.log('Run these in the Supabase SQL Editor, in this order:\n');
for (const [index, file] of files.entries()) {
  console.log(`  ${index + 1}. supabase/migrations/${file}`);
}
console.log(`  ${files.length + 1}. supabase/seed.sql\n`);

if (process.argv.includes('--full')) {
  for (const file of files) {
    console.log(`\n${'='.repeat(94)}\n-- ${file}\n${'='.repeat(94)}\n`);
    console.log(readFileSync(resolve(migrationsDir, file), 'utf8'));
  }
  console.log(`\n${'='.repeat(94)}\n-- seed.sql\n${'='.repeat(94)}\n`);
  console.log(readFileSync(resolve(process.cwd(), 'supabase/seed.sql'), 'utf8'));
} else {
  console.log('Add --full to print the SQL itself:  npm run migrate:print -- --full\n');
}
