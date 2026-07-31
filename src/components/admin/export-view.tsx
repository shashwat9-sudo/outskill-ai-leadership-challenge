'use client';

import { useEffect, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { Button, Card, Eyebrow, Spinner } from '@/components/ui/primitives';
import { RetentionPanel } from '@/components/admin/retention-panel';
import { formatShortDateTime } from '@/lib/utils/time';
import type { AdminAuditEntry } from '@/types/domain';

const EXPORTS = [
  {
    dataset: 'participants',
    title: 'Leads',
    description:
      'Every registration with name, email, phone, both consent flags and their attempt outcome. This is the lead list — treat it as confidential.',
  },
  {
    dataset: 'attempts',
    title: 'Attempts & leaderboard (full)',
    description:
      'Every attempt with rank, score, time, verification and disqualification detail. Includes contact details.',
  },
  {
    dataset: 'leaderboard',
    title: 'Public leaderboard',
    description:
      'Ranked standings with masked display names only. Safe to share outside the event team.',
  },
  {
    dataset: 'questions',
    title: 'Question bank',
    description: 'The full bank in the same CSV format the importer accepts, including correct answers.',
  },
] as const;

export function ExportView() {
  const [audit, setAudit] = useState<AdminAuditEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<{ entries: AdminAuditEntry[] }>('/api/admin/audit?limit=60');
      setAudit(result.ok ? result.data.entries : []);
    })();
  }, []);

  return (
    <>
      <AdminPageHeader
        title="Export & audit"
        description="CSV downloads for the event team, the seven-day retention position, and the record of every admin action taken."
      />

      <section className="grid gap-4 sm:grid-cols-2">
        {EXPORTS.map((entry) => (
          <Card key={entry.dataset} className="flex flex-col justify-between p-6">
            <div>
              <h2 className="text-lg font-semibold">{entry.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">{entry.description}</p>
            </div>
            <a href={`/api/admin/export/${entry.dataset}`} className="mt-5 inline-block">
              <Button variant="secondary">
                <Download aria-hidden className="h-4 w-4" />
                Download CSV
              </Button>
            </a>
          </Card>
        ))}
      </section>

      <section className="mt-8">
        <RetentionPanel />
      </section>

      <section className="mt-8">
        <Card className="p-6">
          <Eyebrow>
            <span className="inline-flex items-center gap-1.5">
              <ScrollText aria-hidden className="h-3.5 w-3.5" />
              Admin audit log
            </span>
          </Eyebrow>

          {audit === null ? (
            <div className="py-8 text-center">
              <Spinner label="Loading audit log" />
            </div>
          ) : audit.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-ink-muted)]">No admin actions recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--color-hairline)] text-sm">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                  <span className="numeric w-32 shrink-0 text-xs text-[var(--color-ink-faint)]">
                    {formatShortDateTime(entry.created_at)}
                  </span>
                  <span className="font-medium text-[var(--color-ink)]">{entry.action}</span>
                  <span className="text-xs text-[var(--color-ink-faint)]">{entry.actor_label}</span>
                  {entry.detail ? (
                    <span className="w-full truncate text-xs text-[var(--color-ink-muted)] sm:w-auto">
                      {summarise(entry.detail)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <p className="mt-6 text-xs text-[var(--color-ink-faint)]">
        Exports open in a new download rather than a new tab. If nothing happens, check that your browser
        is not blocking downloads from this site.
      </p>
    </>
  );
}

/** Render an audit detail object as a short one-line summary. */
function summarise(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ')
    .slice(0, 160);
}
