'use client';

import { useState, type ChangeEvent } from 'react';
import { Modal } from '@/components/admin/admin-leaderboard-view';
import { apiFetch } from '@/lib/client/api';
import { Badge, Button } from '@/components/ui/primitives';

type ImportReport = {
  committed: boolean;
  valid_count?: number;
  inserted?: number;
  updated?: number;
  error_count: number;
  errors: { row: number; code: string; errors: string[] }[];
};

/**
 * CSV import.
 *
 * Always dry-runs first. An organiser sees exactly which spreadsheet rows are wrong, by row number,
 * before anything is written. Invalid rows are never imported, so a single typo cannot activate a
 * broken question in front of 10,000 people.
 */
export function QuestionImportPanel({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  }

  async function run(commit: boolean) {
    setBusy(true);
    setError(null);

    const result = await apiFetch<ImportReport>('/api/admin/questions/import', {
      method: 'POST',
      body: JSON.stringify({ csv, commit }),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setReport(result.data);
    if (commit) onImported();
  }

  return (
    <Modal title="Import questions from CSV" onClose={onClose} wide>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Columns required: code, pillar, difficulty, question_text, option_a–option_d, correct_option,
        explanation, active, review_status. Download the template from the questions page if you need the
        exact format.
      </p>

      <label className="mt-4 block text-sm">
        <span className="text-[var(--color-ink-muted)]">Choose a .csv file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={readFile}
          className="mt-1.5 block w-full text-sm text-[var(--color-ink-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-surface-3)] file:px-4 file:py-2 file:text-sm file:text-[var(--color-ink)]"
        />
      </label>

      <label className="mt-4 block text-sm">
        <span className="text-[var(--color-ink-muted)]">…or paste the CSV here</span>
        <textarea
          rows={6}
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          className="mt-1.5 w-full rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-3.5 py-2.5 font-mono text-xs text-[var(--color-ink)] focus:border-[var(--color-accent)]"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {report ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--color-hairline)] p-4">
          <div className="flex flex-wrap gap-2">
            {report.committed ? (
              <>
                <Badge tone="success">{report.inserted ?? 0} added</Badge>
                <Badge tone="accent">{report.updated ?? 0} updated</Badge>
              </>
            ) : (
              <Badge tone="accent">{report.valid_count ?? 0} rows ready</Badge>
            )}
            {report.error_count > 0 ? <Badge tone="danger">{report.error_count} rejected</Badge> : null}
          </div>

          {report.errors.length > 0 ? (
            <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">
              {report.errors.map((rowError) => (
                <li key={`${rowError.row}-${rowError.code}`} className="text-[var(--color-ink-muted)]">
                  <span className="font-medium text-[var(--color-danger)]">
                    Row {rowError.row}
                    {rowError.code ? ` (${rowError.code})` : ''}:
                  </span>{' '}
                  {rowError.errors.join(' · ')}
                </li>
              ))}
            </ul>
          ) : null}

          {report.committed ? (
            <p className="mt-3 text-sm text-[var(--color-success)]">Import complete.</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void run(false)} disabled={busy || csv.trim().length < 10}>
          Check the file
        </Button>
        <Button
          onClick={() => void run(true)}
          disabled={busy || !report || report.committed || (report.valid_count ?? 0) === 0}
        >
          Import {report?.valid_count ?? 0} valid row{(report?.valid_count ?? 0) === 1 ? '' : 's'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
