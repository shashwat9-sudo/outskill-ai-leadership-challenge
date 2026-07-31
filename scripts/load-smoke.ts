/**
 * Lightweight smoke / load check.
 *
 *   npm run load:smoke                       (defaults to http://localhost:3000)
 *   npm run load:smoke -- --url https://…    (any environment)
 *   npm run load:smoke -- --requests 200 --concurrency 20
 *
 * READ-ONLY BY DESIGN. It only touches the public landing page, the leaderboard endpoint and the
 * stats endpoint. It never registers a participant, never starts an attempt and never writes
 * anything, so it is safe to point at the live event URL between sessions.
 *
 * If you want to load-test the write path, do it against a dedicated throwaway Supabase project —
 * never against the event database.
 */

type Target = { name: string; path: string; expect: 'html' | 'json' };

const TARGETS: Target[] = [
  { name: 'Landing page', path: '/', expect: 'html' },
  { name: 'Leaderboard API', path: '/api/public/leaderboard', expect: 'json' },
  { name: 'Stats API', path: '/api/public/stats', expect: 'json' },
];

type Options = { url: string; requests: number; concurrency: number };

function parseArgs(argv: string[]): Options {
  const options: Options = { url: 'http://localhost:3000', requests: 60, concurrency: 6 };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) continue;
    if (flag === '--url') options.url = value.replace(/\/+$/, '');
    if (flag === '--requests') options.requests = Math.max(1, Math.min(2000, Number(value) || 60));
    if (flag === '--concurrency') options.concurrency = Math.max(1, Math.min(50, Number(value) || 6));
  }

  return options;
}

type Sample = { ok: boolean; ms: number; status: number };

async function hit(url: string, target: Target): Promise<Sample> {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${url}${target.path}`, { headers: { 'user-agent': 'outskill-smoke/1.0' } });
    const body = await response.text();
    const ms = performance.now() - startedAt;

    const shapeOk =
      target.expect === 'json'
        ? body.trimStart().startsWith('{') && body.includes('"ok"')
        : body.includes('<html') || body.includes('<!DOCTYPE');

    return { ok: response.ok && shapeOk, ms, status: response.status };
  } catch {
    return { ok: false, ms: performance.now() - startedAt, status: 0 };
  }
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

async function runTarget(options: Options, target: Target): Promise<void> {
  const samples: Sample[] = [];
  let issued = 0;

  async function worker(): Promise<void> {
    while (issued < options.requests) {
      issued += 1;
      samples.push(await hit(options.url, target));
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));

  const durations = samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const failures = samples.filter((sample) => !sample.ok);

  const label = target.name.padEnd(18);
  const summary =
    `${label} ${samples.length} requests · ` +
    `p50 ${percentile(durations, 0.5).toFixed(0)}ms · ` +
    `p95 ${percentile(durations, 0.95).toFixed(0)}ms · ` +
    `max ${(durations[durations.length - 1] ?? 0).toFixed(0)}ms · ` +
    `${failures.length} failed`;

  console.log(failures.length === 0 ? `  PASS  ${summary}` : `  FAIL  ${summary}`);

  if (failures.length > 0) {
    const statuses = [...new Set(failures.map((failure) => failure.status))].join(', ');
    console.log(`        failing status codes: ${statuses || 'network error'}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  console.log(`\nSmoke check against ${options.url}`);
  console.log(`${options.requests} requests per endpoint, ${options.concurrency} at a time. Read-only.\n`);

  for (const target of TARGETS) {
    await runTarget(options, target);
  }

  console.log(
    process.exitCode === 1
      ? '\nSomething is not healthy. Check the server logs before the doors open.\n'
      : '\nAll public endpoints are healthy.\n',
  );
}

void main();
