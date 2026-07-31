'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, LifeBuoy, Search } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { Modal } from '@/components/admin/admin-leaderboard-view';
import { Badge, Button, EmptyState, Spinner } from '@/components/ui/primitives';
import { formatElapsed } from '@/lib/quiz/scoring';
import { formatShortDateTime } from '@/lib/utils/time';
import type { AdminParticipantRow } from '@/types/domain';

type Payload = { participants: AdminParticipantRow[]; questions_per_attempt: number };

/**
 * Participant management.
 *
 * The only destructive-looking action here is "Reset after technical failure", and it is not
 * destructive: it invalidates the existing attempt and grants one replacement. Permanent deletion is
 * deliberately not offered — an accidental tap during a busy event would be unrecoverable.
 */
export function ParticipantsView() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<AdminParticipantRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    const params = new URLSearchParams({ limit: '100' });
    if (search.trim()) params.set('q', search.trim());

    const result = await apiFetch<Payload>(`/api/admin/participants?${params.toString()}`);
    if (result.ok) {
      setPayload(result.data);
      setError(null);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Deferred by a microtask so the initial fetch does not update state inside the effect body.
    void Promise.resolve().then(() => load(''));
  }, [load]);

  async function submitReset() {
    if (!resetting) return;
    setBusy(true);

    const result = await apiFetch('/api/admin/participants/reset', {
      method: 'POST',
      body: JSON.stringify({ participant_id: resetting.participant.id, reason: reason.trim() }),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setNotice(
      `${resetting.participant.full_name} can now take one replacement attempt. Ask them to open the challenge and register again with the same email — they will be recognised.`,
    );
    setResetting(null);
    setReason('');
    await load(query);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading participants" />
      </div>
    );
  }

  const rows = payload?.participants ?? [];
  const perAttempt = payload?.questions_per_attempt ?? 7;

  return (
    <>
      <AdminPageHeader
        title="Participants"
        description="Search by name, email, phone or participant ID. Records are never deleted here."
        actions={
          // A Route Handler streaming a CSV attachment, not a page — next/link would client-navigate
          // and break the download.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/api/admin/export/participants">
            <Button variant="secondary">
              <Download aria-hidden className="h-4 w-4" />
              Export leads CSV
            </Button>
          </a>
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
        className="mb-5 flex gap-2"
      >
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-faint)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, email, phone or participant ID"
            aria-label="Search participants"
            className="w-full min-h-[3rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] pl-10 pr-4 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)]"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {notice ? (
        <p role="status" className="mb-4 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-success)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-success)_10%,transparent)] px-4 py-3 text-sm text-[var(--color-success)]">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No participants found" description="Nobody has registered yet, or the search returned nothing." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-hairline)] text-left text-xs uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
                <th scope="col" className="py-3 pr-3">Participant</th>
                <th scope="col" className="py-3 pr-3">Contact</th>
                <th scope="col" className="py-3 pr-3">Registered</th>
                <th scope="col" className="py-3 pr-3">Attempt</th>
                <th scope="col" className="py-3 pr-3">Consent</th>
                <th scope="col" className="py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.participant.id} className="border-b border-[var(--color-hairline)] align-top">
                  <td className="py-3.5 pr-3">
                    <p className="font-medium text-[var(--color-ink)]">{row.participant.full_name}</p>
                    <p className="numeric mt-0.5 text-[0.7rem] text-[var(--color-ink-faint)]">{row.participant.id}</p>
                  </td>
                  <td className="py-3.5 pr-3 text-[var(--color-ink-muted)]">
                    <p>{row.participant.email}</p>
                    <p className="numeric mt-0.5">{row.participant.phone_e164}</p>
                  </td>
                  <td className="py-3.5 pr-3 text-[var(--color-ink-muted)]">
                    {formatShortDateTime(row.participant.created_at)}
                  </td>
                  <td className="py-3.5 pr-3">
                    {row.latest_attempt ? (
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge
                          tone={
                            row.latest_attempt.status === 'submitted'
                              ? 'success'
                              : row.latest_attempt.status === 'disqualified'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {row.latest_attempt.status}
                        </Badge>
                        {row.latest_attempt.correct_count !== null ? (
                          <span className="numeric text-xs text-[var(--color-ink-muted)]">
                            {row.latest_attempt.correct_count}/{perAttempt} ·{' '}
                            {formatElapsed(row.latest_attempt.elapsed_ms ?? 0)}
                            {row.rank !== null ? ` · rank #${row.rank}` : ''}
                          </span>
                        ) : null}
                        {row.latest_attempt.verified_at ? <Badge tone="success">Verified</Badge> : null}
                      </div>
                    ) : (
                      <span className="text-[var(--color-ink-faint)]">—</span>
                    )}
                  </td>
                  <td className="py-3.5 pr-3 text-[0.75rem] text-[var(--color-ink-muted)]">
                    <p>Public: {row.participant.public_leaderboard_opt_in ? 'yes' : 'no'}</p>
                    <p>Follow-up: {row.participant.marketing_opt_in ? 'yes' : 'no'}</p>
                  </td>
                  <td className="py-3.5 text-right">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setResetting(row);
                        setReason('');
                        setNotice(null);
                      }}
                    >
                      <LifeBuoy aria-hidden className="h-3.5 w-3.5" />
                      Reset
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resetting ? (
        <Modal title={`Reset ${resetting.participant.full_name}?`} onClose={() => setResetting(null)}>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Use this only after a genuine technical failure — a frozen tablet, or Wi-Fi dropping mid-run.
            The existing attempt is invalidated (removed from the leaderboard, kept in the records) and the
            participant may take exactly one replacement attempt.
          </p>
          <label className="mt-4 block text-sm">
            What happened? (required)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-4 py-3 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)]"
              placeholder="e.g. Tablet 3 froze at question 4, confirmed by booth staff"
            />
          </label>
          <div className="mt-5 flex gap-2">
            <Button onClick={() => void submitReset()} disabled={reason.trim().length < 5 || busy}>
              Confirm reset
            </Button>
            <Button variant="ghost" onClick={() => setResetting(null)}>
              Cancel
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
