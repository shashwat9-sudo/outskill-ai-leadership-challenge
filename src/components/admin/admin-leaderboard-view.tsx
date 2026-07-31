'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Ban, Eye, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { AttemptInspector } from '@/components/admin/attempt-inspector';
import { Badge, Button, EmptyState, Spinner } from '@/components/ui/primitives';
import { formatElapsed } from '@/lib/quiz/scoring';
import { formatShortDateTime } from '@/lib/utils/time';
import type { AdminAttemptRow } from '@/types/domain';

type Payload = {
  attempts: AdminAttemptRow[];
  questions_per_attempt: number;
  leaderboard_size: number;
};

/**
 * The admin leaderboard.
 *
 * This is the verification desk view, so it deliberately shows the contact details the public board
 * masks — booth staff have to check a badge against a name and a phone number. Disqualifying and
 * restoring both require a confirmation step because they change who wins an iPad.
 */
export function AdminLeaderboardView() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [disqualifying, setDisqualifying] = useState<AdminAttemptRow | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async (search: string) => {
    const params = new URLSearchParams({ limit: '200' });
    if (search.trim()) params.set('q', search.trim());

    const result = await apiFetch<Payload>(`/api/admin/attempts?${params.toString()}`);
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

  async function act(url: string, body: Record<string, unknown>, attemptId: string) {
    setBusyId(attemptId);
    const result = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
    setBusyId(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setDisqualifying(null);
    setReason('');
    await load(query);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading entries" />
      </div>
    );
  }

  const rows = payload?.attempts ?? [];
  const perAttempt = payload?.questions_per_attempt ?? 7;
  const topN = payload?.leaderboard_size ?? 10;

  return (
    <>
      <AdminPageHeader
        title="Leaderboard & verification"
        description={`Verify the top ${topN} in person before the prize is awarded. Check the participant's badge against the name and phone number shown here.`}
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
            placeholder="Search by name, email or phone"
            aria-label="Search entries"
            className="w-full min-h-[3rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] pl-10 pr-4 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)]"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {error ? (
        <p role="alert" className="mb-4 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No entries found" description="Nobody has completed the challenge yet, or the search returned nothing." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-hairline)] text-left text-xs uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
                <th scope="col" className="py-3 pr-3">Rank</th>
                <th scope="col" className="py-3 pr-3">Participant</th>
                <th scope="col" className="py-3 pr-3">Contact</th>
                <th scope="col" className="py-3 pr-3">Score</th>
                <th scope="col" className="py-3 pr-3">Submitted</th>
                <th scope="col" className="py-3 pr-3">Consent</th>
                <th scope="col" className="py-3 pr-3">Status</th>
                <th scope="col" className="py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const inTop = row.rank > 0 && row.rank <= topN;
                const busy = busyId === row.attempt_id;

                return (
                  <tr key={row.attempt_id} className="border-b border-[var(--color-hairline)] align-top">
                    <td className="numeric py-3.5 pr-3 font-semibold">
                      {row.rank > 0 ? row.rank : '—'}
                      {inTop ? <span className="ml-1.5 text-[0.65rem] text-[var(--color-accent)]">TOP {topN}</span> : null}
                    </td>
                    <td className="py-3.5 pr-3">
                      <p className="font-medium text-[var(--color-ink)]">{row.full_name}</p>
                      <p className="numeric mt-0.5 text-[0.7rem] text-[var(--color-ink-faint)]">{row.attempt_id}</p>
                    </td>
                    <td className="py-3.5 pr-3 text-[var(--color-ink-muted)]">
                      <p>{row.email}</p>
                      <p className="numeric mt-0.5">{row.phone_e164}</p>
                    </td>
                    <td className="numeric py-3.5 pr-3">
                      <p className="font-semibold text-[var(--color-ink)]">
                        {row.correct_count}/{perAttempt}
                      </p>
                      <p className="mt-0.5 text-[var(--color-ink-muted)]">{formatElapsed(row.elapsed_ms)}</p>
                    </td>
                    <td className="py-3.5 pr-3 text-[var(--color-ink-muted)]">
                      {row.submitted_at ? formatShortDateTime(row.submitted_at) : '—'}
                    </td>
                    <td className="py-3.5 pr-3 text-[0.75rem] text-[var(--color-ink-muted)]">
                      <p>Public: {row.public_leaderboard_opt_in ? 'yes' : 'no'}</p>
                      <p>Follow-up: {row.marketing_opt_in ? 'yes' : 'no'}</p>
                    </td>
                    <td className="py-3.5 pr-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {row.disqualified_at ? (
                          <Badge tone="danger">Disqualified</Badge>
                        ) : row.verified ? (
                          <Badge tone="success">
                            <BadgeCheck aria-hidden className="h-3 w-3" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge tone="warning">Pending</Badge>
                        )}
                        {row.disqualification_reason ? (
                          <span className="max-w-[12rem] text-[0.7rem] text-[var(--color-ink-faint)]">
                            {row.disqualification_reason}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3.5">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button variant="ghost" onClick={() => setInspecting(row.attempt_id)} disabled={busy}>
                          <Eye aria-hidden className="h-3.5 w-3.5" />
                          Inspect
                        </Button>

                        {row.disqualified_at ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              if (window.confirm('Restore this entry to the leaderboard?')) {
                                void act('/api/admin/attempts/restore', { attempt_id: row.attempt_id }, row.attempt_id);
                              }
                            }}
                            disabled={busy}
                          >
                            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                            Restore
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant={row.verified ? 'ghost' : 'primary'}
                              onClick={() =>
                                void act(
                                  '/api/admin/attempts/verify',
                                  { attempt_id: row.attempt_id, verified: !row.verified },
                                  row.attempt_id,
                                )
                              }
                              disabled={busy}
                            >
                              <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
                              {row.verified ? 'Un-verify' : 'Verify'}
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => {
                                setDisqualifying(row);
                                setReason('');
                              }}
                              disabled={busy}
                            >
                              <Ban aria-hidden className="h-3.5 w-3.5" />
                              Disqualify
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {disqualifying ? (
        <Modal title={`Disqualify ${disqualifying.full_name}?`} onClose={() => setDisqualifying(null)}>
          <p className="text-sm text-[var(--color-ink-muted)]">
            This removes the entry from the leaderboard. Nothing is deleted, and the reason is recorded in
            the audit log so the decision can be explained later.
          </p>
          <label className="mt-4 block text-sm">
            Reason (required)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-4 py-3 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)]"
              placeholder="e.g. Duplicate entry using a colleague's details, confirmed at the desk"
            />
          </label>
          <div className="mt-5 flex gap-2">
            <Button
              variant="danger"
              disabled={reason.trim().length < 5}
              onClick={() =>
                void act(
                  '/api/admin/attempts/disqualify',
                  { attempt_id: disqualifying.attempt_id, reason: reason.trim() },
                  disqualifying.attempt_id,
                )
              }
            >
              Confirm disqualification
            </Button>
            <Button variant="ghost" onClick={() => setDisqualifying(null)}>
              Cancel
            </Button>
          </div>
        </Modal>
      ) : null}

      {inspecting ? <AttemptInspector attemptId={inspecting} onClose={() => setInspecting(null)} /> : null}
    </>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`surface my-auto w-full p-6 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
