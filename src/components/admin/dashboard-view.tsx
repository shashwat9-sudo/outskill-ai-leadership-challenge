'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CircleAlert } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { QuizStateControls } from '@/components/admin/quiz-state-controls';
import { Badge, Card, Eyebrow, EmptyState, Spinner, Stat } from '@/components/ui/primitives';
import { formatElapsed } from '@/lib/quiz/scoring';
import { buildPublicName } from '@/lib/utils/identity';
import { formatShortDateTime } from '@/lib/utils/time';
import type { Difficulty } from '@/lib/config/constants';
import type { AppSettings, DashboardMetrics } from '@/types/domain';

type DashboardPayload = {
  metrics: DashboardMetrics;
  settings: AppSettings;
  pool_health: { ok: boolean; messages: string[]; counts: Record<Difficulty, number> };
  environment: { ok: boolean; demoMode: boolean; missing: { variable: string; message: string }[] };
  store_kind: 'supabase' | 'demo';
};

const REFRESH_MS = 15_000;

export function DashboardView() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await apiFetch<DashboardPayload>('/api/admin/dashboard');
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Kicked off in a microtask so the first paint is the server-rendered markup, not a state update
    // fired during the effect body.
    void Promise.resolve().then(load);
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading event metrics" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Could not load the dashboard"
        description={error ?? 'Please refresh the page, or check the deployment configuration.'}
      />
    );
  }

  const { metrics, settings, pool_health: pool, environment } = data;
  const perAttempt = settings.questions_per_attempt;
  const peak = Math.max(1, ...metrics.attempts_over_time.map((bucket) => bucket.count));

  return (
    <>
      <AdminPageHeader
        title="Event dashboard"
        description={`${settings.event_name} · ${settings.event_location}`}
      />

      {environment.missing.length > 0 ? (
        <Alert tone="danger" title="Configuration incomplete">
          {environment.missing.map((entry) => (
            <p key={entry.variable}>{entry.message}</p>
          ))}
        </Alert>
      ) : null}

      {!pool.ok ? (
        <Alert tone="warning" title="The question pool cannot serve a full attempt">
          {pool.messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </Alert>
      ) : null}

      {data.store_kind === 'demo' ? (
        <Alert tone="warning" title="Demo mode is on">
          <p>Everything on this screen is sample data held in memory and lost on restart. Configure Supabase before the event.</p>
        </Alert>
      ) : null}

      <div className="mb-6">
        <QuizStateControls state={metrics.quiz_state} onChanged={() => void load()} />
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registrations" value={metrics.total_registrations.toLocaleString('en-IN')} />
        <Stat label="Completed attempts" value={metrics.total_completed.toLocaleString('en-IN')} />
        <Stat label="Completion rate" value={`${Math.round(metrics.completion_rate * 100)}%`} />
        <Stat
          label="Average score"
          value={metrics.average_score !== null ? metrics.average_score.toFixed(2) : '—'}
          hint={`out of ${perAttempt}`}
        />
        <Stat label="Perfect scores" value={metrics.perfect_scores} accent />
        <Stat label={`Verified top ${settings.leaderboard_size}`} value={metrics.verified_top_entries} />
        <Stat
          label="Pending verification"
          value={metrics.pending_top_verifications}
          hint={metrics.pending_top_verifications > 0 ? 'Ask them to visit the desk' : 'All clear'}
        />
        <Stat
          label="Question pool"
          value={pool.counts.easy + pool.counts.medium + pool.counts.hard}
          hint={`${pool.counts.easy} easy · ${pool.counts.medium} medium · ${pool.counts.hard} hard`}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <Eyebrow>Winner tracking</Eyebrow>
          <div className="mt-4 space-y-4">
            <WinnerRow
              label="Provisional winner (rank 1)"
              row={metrics.provisional_winner}
              perAttempt={perAttempt}
            />
            <WinnerRow
              label="Highest verified entry"
              row={metrics.verified_winner}
              perAttempt={perAttempt}
              verified
            />
          </div>
          <p className="mt-5 text-xs text-[var(--color-ink-faint)]">
            Only a verified, non-disqualified entry can take the prize, and only after the challenge is
            locked at the end of Day 2.
          </p>
        </Card>

        <Card className="p-6">
          <Eyebrow>Attempts over time</Eyebrow>
          {metrics.attempts_over_time.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-ink-muted)]">No completed attempts yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {metrics.attempts_over_time.slice(-8).map((bucket) => (
                <li key={bucket.bucket} className="flex items-center gap-3">
                  <span className="numeric w-24 shrink-0 text-xs text-[var(--color-ink-faint)]">
                    {formatShortDateTime(bucket.bucket)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-hairline)]">
                    <span
                      className="accent-gradient block h-full rounded-full"
                      style={{ width: `${Math.round((bucket.count / peak) * 100)}%` }}
                    />
                  </span>
                  <span className="numeric w-8 shrink-0 text-right text-xs text-[var(--color-ink-muted)]">
                    {bucket.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-6">
          <Eyebrow>Recent submissions</Eyebrow>
          {metrics.recent_submissions.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-ink-muted)]">Nothing submitted yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--color-hairline)]">
              {metrics.recent_submissions.map((entry) => (
                <li key={entry.attempt_id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="truncate text-sm text-[var(--color-ink)]">{entry.display_name}</span>
                  <span className="numeric shrink-0 text-sm text-[var(--color-ink-muted)]">
                    {entry.correct_count}/{perAttempt} · {formatElapsed(entry.elapsed_ms)} ·{' '}
                    {formatShortDateTime(entry.submitted_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {error ? (
        <p role="status" className="mt-4 text-sm text-[var(--color-warning)]">
          Live refresh failed on the last attempt: {error}
        </p>
      ) : null}
    </>
  );
}

function WinnerRow({
  label,
  row,
  perAttempt,
  verified = false,
}: {
  label: string;
  row: DashboardMetrics['provisional_winner'];
  perAttempt: number;
  verified?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">{label}</p>
      {row ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span className="text-lg font-medium text-[var(--color-ink)]">
            {buildPublicName(row.full_name, row.public_leaderboard_opt_in, row.public_number)}
          </span>
          <span className="numeric text-sm text-[var(--color-ink-muted)]">
            {row.correct_count}/{perAttempt} · {formatElapsed(row.elapsed_ms)}
          </span>
          {row.verified ? (
            <Badge tone="success">
              <BadgeCheck aria-hidden className="h-3 w-3" />
              Verified
            </Badge>
          ) : (
            <Badge tone="warning">Pending verification</Badge>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
          {verified ? 'No verified entry yet.' : 'No completed attempts yet.'}
        </p>
      )}
    </div>
  );
}

function Alert({
  tone,
  title,
  children,
}: {
  tone: 'warning' | 'danger';
  title: string;
  children: React.ReactNode;
}) {
  const colour = tone === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)';
  const Icon = tone === 'warning' ? AlertTriangle : CircleAlert;

  return (
    <div
      role="alert"
      className="mb-5 rounded-[var(--radius-lg)] border p-5"
      style={{
        borderColor: `color-mix(in oklab, ${colour} 40%, transparent)`,
        background: `color-mix(in oklab, ${colour} 8%, transparent)`,
      }}
    >
      <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: colour }}>
        <Icon aria-hidden className="h-4 w-4" />
        {title}
      </p>
      <div className="mt-2 space-y-1 text-sm text-[var(--color-ink-muted)]">{children}</div>
    </div>
  );
}
