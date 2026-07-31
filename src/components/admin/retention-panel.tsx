'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { Badge, Button, Card, Spinner } from '@/components/ui/primitives';
import { formatShortDateTime } from '@/lib/utils/time';

/**
 * Seven-day retention and the anonymisation workflow.
 *
 * Nothing on this panel happens automatically. It reports where the event stands against the
 * retention commitment and gives an administrator a deliberately awkward way to act on it: the lead
 * export has to have happened, the shared password has to be re-entered, and the confirmation phrase
 * has to be typed exactly. The action is irreversible and the copy says so plainly.
 */

type RetentionStatus = {
  event_end_at: string;
  retention_days: number;
  retention_deadline_at: string;
  days_remaining: number;
  total_participants: number;
  anonymised_participants: number;
  fully_anonymised: boolean;
  export_completed: boolean;
  last_export_at: string | null;
  last_anonymised_at: string | null;
  confirmation_phrase: string;
};

export function RetentionPanel() {
  const [status, setStatus] = useState<RetentionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const result = await apiFetch<RetentionStatus>('/api/admin/retention');
    if (result.ok) setStatus(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function anonymise() {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);

    const result = await apiFetch<{ anonymised: number; alreadyAnonymised: number }>('/api/admin/retention', {
      method: 'POST',
      body: JSON.stringify({ password, confirmation }),
    });

    setSubmitting(false);
    setPassword('');

    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error.message });
      return;
    }

    setConfirmation('');
    setMessage({
      tone: 'success',
      text: `${result.data.anonymised} participant record(s) anonymised. Scores and rankings are unchanged.`,
    });
    await load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading retention status" />
      </div>
    );
  }
  if (!status) return null;

  const overdue = status.days_remaining < 0;
  const canAnonymise = status.export_completed && !status.fully_anonymised && confirmation.length > 0 && password.length > 0;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">Data retention</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Participant details are kept for {status.retention_days} days after the event, then anonymised
            by an administrator. Nothing is deleted automatically.
          </p>
        </div>
        {status.fully_anonymised ? (
          <Badge tone="success">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
            Anonymised
          </Badge>
        ) : overdue ? (
          <Badge tone="danger">Retention deadline passed</Badge>
        ) : (
          <Badge tone="neutral">{status.days_remaining} day(s) remaining</Badge>
        )}
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <Fact label="Event ends" value={formatShortDateTime(status.event_end_at)} />
        <Fact label="Retention deadline" value={formatShortDateTime(status.retention_deadline_at)} />
        <Fact
          label="Days remaining"
          value={overdue ? `${Math.abs(status.days_remaining)} day(s) overdue` : String(status.days_remaining)}
        />
        <Fact
          label="Lead export completed"
          value={
            status.export_completed && status.last_export_at
              ? `Yes — ${formatShortDateTime(status.last_export_at)}`
              : 'Not yet'
          }
        />
        <Fact
          label="Participants"
          value={`${status.anonymised_participants} of ${status.total_participants} anonymised`}
        />
        <Fact
          label="Last anonymisation"
          value={status.last_anonymised_at ? formatShortDateTime(status.last_anonymised_at) : '—'}
        />
      </dl>

      {status.fully_anonymised ? (
        <p className="mt-6 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-success)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-success)_8%,transparent)] px-4 py-3 text-sm text-[var(--color-success)]">
          Every participant record has been anonymised. Scores, times and rankings are retained for
          aggregate reporting; the people behind them are no longer identifiable.
        </p>
      ) : (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_6%,transparent)] p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-danger)]">
            <AlertTriangle aria-hidden className="h-4 w-4" />
            This action cannot be undone
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Anonymising replaces every participant&rsquo;s name, email address and phone number with a
            placeholder, permanently. Scores, completion times and rankings are kept so the event
            statistics still work. <strong>Download the Leads CSV first</strong> — afterwards there is no
            way to recover the contact details from this system.
          </p>

          {!status.export_completed ? (
            <p className="mt-4 text-sm font-medium text-[var(--color-warning)]" role="status">
              No lead export has been recorded yet. Download the Leads CSV above before anonymising.
            </p>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Admin password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!status.export_completed}
                className="w-full min-h-[3rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-4 text-base text-[var(--color-ink)] focus:border-[var(--color-accent)] disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Type <code className="text-[var(--color-danger)]">{status.confirmation_phrase}</code>
              </span>
              <input
                type="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={!status.export_completed}
                className="w-full min-h-[3rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-4 text-base text-[var(--color-ink)] focus:border-[var(--color-accent)] disabled:opacity-50"
              />
            </label>
          </div>

          <Button
            variant="danger"
            className="mt-5"
            disabled={!canAnonymise || submitting}
            onClick={anonymise}
            data-testid="anonymise-submit"
          >
            {submitting ? 'Anonymising…' : 'Anonymise participant data'}
          </Button>
        </div>
      )}

      {message ? (
        <p
          role="alert"
          className={`mt-4 text-sm ${message.tone === 'error' ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}
        >
          {message.text}
        </p>
      ) : null}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">{label}</dt>
      <dd className="mt-1 text-sm text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
