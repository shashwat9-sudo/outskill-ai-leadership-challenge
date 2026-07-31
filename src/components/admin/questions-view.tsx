'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Download, Eye, FileUp, Pencil, Plus } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { Modal } from '@/components/admin/admin-leaderboard-view';
import { QuestionEditor, type QuestionFormValues } from '@/components/admin/question-editor';
import { QuestionImportPanel } from '@/components/admin/question-import-panel';
import { Badge, Button, EmptyState, Spinner } from '@/components/ui/primitives';
import {
  DIFFICULTIES,
  PILLARS,
  PILLAR_LABELS,
  REVIEW_STATUSES,
  type Difficulty,
  type OptionId,
} from '@/lib/config/constants';
import type { Question } from '@/types/domain';

type Payload = {
  questions: Question[];
  total: number;
  pool_health: { ok: boolean; messages: string[]; counts: Record<Difficulty, number> };
  summary: {
    total: number;
    active: number;
    approved: number;
    servable: number;
    by_pillar: Record<string, number>;
    by_difficulty: Record<Difficulty, number>;
    warnings: string[];
  };
};

const REVIEW_TONE = { draft: 'warning', reviewed: 'neutral', approved: 'success' } as const;

export function QuestionsView() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({ q: '', pillar: '', difficulty: '', active: '', review_status: '' });
  const [editing, setEditing] = useState<{ mode: 'create' | 'edit'; question?: Question; initial?: QuestionFormValues } | null>(null);
  const [previewing, setPreviewing] = useState<Question | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async (current: typeof filters) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(current)) {
      if (value) params.set(key, value);
    }

    const result = await apiFetch<Payload>(`/api/admin/questions?${params.toString()}`);
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
    void Promise.resolve().then(() => load(filters));
    // Filter changes re-query the server rather than filtering in the browser, so the counts shown
    // always match what the selection engine would actually see.
  }, [load, filters]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading questions" />
      </div>
    );
  }

  const questions = payload?.questions ?? [];
  const pool = payload?.pool_health;
  const summary = payload?.summary;

  return (
    <>
      <AdminPageHeader
        title="Question bank"
        description={`${payload?.total ?? 0} questions total. Only active questions marked reviewed or approved are served to participants.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- this is a Route Handler that streams a CSV attachment, not a page; next/link would do a client navigation and break the download. */}
            <a href="/api/admin/questions/template">
              <Button variant="ghost">
                <Download aria-hidden className="h-4 w-4" />
                CSV template
              </Button>
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- this is a Route Handler that streams a CSV attachment, not a page; next/link would do a client navigation and break the download. */}
            <a href="/api/admin/export/questions">
              <Button variant="ghost">
                <Download aria-hidden className="h-4 w-4" />
                Export
              </Button>
            </a>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <FileUp aria-hidden className="h-4 w-4" />
              Import CSV
            </Button>
            <Button onClick={() => setEditing({ mode: 'create' })}>
              <Plus aria-hidden className="h-4 w-4" />
              New question
            </Button>
          </div>
        }
      />

      {summary ? (
        <section
          className="mb-5 rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5"
          aria-label="Question bank summary"
          data-testid="question-bank-summary"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
              Bank summary
            </h2>
            <p
              className={`text-sm font-medium ${
                summary.warnings.length === 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
              }`}
            >
              {summary.servable} active, approved and servable
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Total" value={summary.total} />
            <SummaryStat label="Active" value={summary.active} />
            <SummaryStat label="Approved" value={summary.approved} />
            <SummaryStat label="Servable" value={summary.servable} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">By difficulty</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-ink-muted)]">
                {DIFFICULTIES.map((difficulty) => (
                  <li key={difficulty} className="flex justify-between gap-4">
                    <span className="capitalize">{difficulty}</span>
                    <span className="numeric text-[var(--color-ink)]">{summary.by_difficulty[difficulty]}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">By pillar</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-ink-muted)]">
                {PILLARS.map((pillar) => (
                  <li key={pillar} className="flex justify-between gap-4">
                    <span>{PILLAR_LABELS[pillar]}</span>
                    <span className="numeric text-[var(--color-ink)]">{summary.by_pillar[pillar] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {summary.warnings.length > 0 ? (
            <ul className="mt-4 space-y-1 border-t border-[var(--color-hairline)] pt-4 text-sm text-[var(--color-warning)]">
              {summary.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border-t border-[var(--color-hairline)] pt-4 text-sm text-[var(--color-success)]">
              No validation warnings. The bank is ready for the event.
            </p>
          )}
        </section>
      ) : null}

      {pool && !pool.ok ? (
        <div
          role="alert"
          className="mb-5 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--color-warning)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_8%,transparent)] p-5"
        >
          <p className="text-sm font-semibold text-[var(--color-warning)]">
            The active pool cannot serve a full attempt
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-ink-muted)]">
            {pool.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          value={filters.q}
          onChange={(event) => setFilters({ ...filters, q: event.target.value })}
          placeholder="Search code or question text"
          aria-label="Search questions"
          className="min-h-[2.75rem] flex-1 rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-4 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)]"
        />
        <FilterSelect
          label="Pillar"
          value={filters.pillar}
          onChange={(value) => setFilters({ ...filters, pillar: value })}
          options={PILLARS.map((pillar) => ({ value: pillar, label: PILLAR_LABELS[pillar] }))}
        />
        <FilterSelect
          label="Difficulty"
          value={filters.difficulty}
          onChange={(value) => setFilters({ ...filters, difficulty: value })}
          options={DIFFICULTIES.map((difficulty) => ({ value: difficulty, label: difficulty }))}
        />
        <FilterSelect
          label="Active"
          value={filters.active}
          onChange={(value) => setFilters({ ...filters, active: value })}
          options={[
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ]}
        />
        <FilterSelect
          label="Review"
          value={filters.review_status}
          onChange={(value) => setFilters({ ...filters, review_status: value })}
          options={REVIEW_STATUSES.map((status) => ({ value: status, label: status }))}
        />
      </div>

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {questions.length === 0 ? (
        <EmptyState title="No questions match" description="Adjust the filters, or add a question." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-hairline)] text-left text-xs uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
                <th scope="col" className="py-3 pr-3">Code</th>
                <th scope="col" className="py-3 pr-3">Question</th>
                <th scope="col" className="py-3 pr-3">Pillar</th>
                <th scope="col" className="py-3 pr-3">Difficulty</th>
                <th scope="col" className="py-3 pr-3">Status</th>
                <th scope="col" className="py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <tr key={question.id} className="border-b border-[var(--color-hairline)] align-top">
                  <td className="numeric py-3.5 pr-3 text-[var(--color-ink-muted)]">{question.code}</td>
                  <td className="max-w-md py-3.5 pr-3 text-[var(--color-ink)]">{question.question_text}</td>
                  <td className="py-3.5 pr-3 text-[var(--color-ink-muted)]">{PILLAR_LABELS[question.pillar]}</td>
                  <td className="py-3.5 pr-3 text-[var(--color-ink-muted)]">{question.difficulty}</td>
                  <td className="py-3.5 pr-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <Badge tone={question.active ? 'accent' : 'neutral'}>
                        {question.active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge tone={REVIEW_TONE[question.review_status]}>{question.review_status}</Badge>
                    </div>
                  </td>
                  <td className="py-3.5">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button variant="ghost" onClick={() => setPreviewing(question)}>
                        <Eye aria-hidden className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setEditing({ mode: 'create', initial: duplicateOf(question) })}
                      >
                        <Copy aria-hidden className="h-3.5 w-3.5" />
                        Duplicate
                      </Button>
                      <Button variant="secondary" onClick={() => setEditing({ mode: 'edit', question })}>
                        <Pencil aria-hidden className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <QuestionEditor
          mode={editing.mode}
          question={editing.question}
          initial={editing.initial}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load(filters);
          }}
        />
      ) : null}

      {importing ? (
        <QuestionImportPanel
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            void load(filters);
          }}
        />
      ) : null}

      {previewing ? (
        <Modal title={`Preview · ${previewing.code}`} onClose={() => setPreviewing(null)}>
          <p className="text-lg text-[var(--color-ink)]">{previewing.question_text}</p>
          <ul className="mt-4 space-y-2">
            {previewing.options.map((option, index) => (
              <li
                key={option.id}
                className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] px-4 py-3 text-sm"
              >
                <span className="text-xs font-semibold uppercase text-[var(--color-ink-faint)]">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="text-[var(--color-ink)]">{option.text}</span>
                {option.id === previewing.correct_option_id ? <Badge tone="success">Correct</Badge> : null}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm italic text-[var(--color-ink-muted)]">{previewing.explanation}</p>
          <p className="mt-4 text-xs text-[var(--color-ink-faint)]">
            Participants see the options in a randomised order and never see which one is correct.
          </p>
        </Modal>
      ) : null}
    </>
  );
}

function duplicateOf(question: Question): QuestionFormValues {
  const optionText = (id: OptionId) => question.options.find((option) => option.id === id)?.text ?? '';
  return {
    code: `${question.code}-COPY`,
    pillar: question.pillar,
    difficulty: question.difficulty,
    question_text: question.question_text,
    option_a: optionText('a'),
    option_b: optionText('b'),
    option_c: optionText('c'),
    option_d: optionText('d'),
    correct_option: question.correct_option_id,
    explanation: question.explanation,
    active: false,
    review_status: 'draft',
  };
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[2.75rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)]"
      >
        <option value="">{label}: all</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One number in the bank summary. Kept plain so four of them read as a single row at a glance. */
function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-hairline)] bg-[var(--color-surface-2)] px-4 py-3">
      <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">{label}</p>
      <p className="numeric mt-1 text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
