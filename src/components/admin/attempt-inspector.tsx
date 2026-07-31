'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { Badge, Spinner } from '@/components/ui/primitives';
import { Modal } from '@/components/admin/admin-leaderboard-view';
import { PILLAR_LABELS, type Difficulty, type OptionId, type Pillar } from '@/lib/config/constants';
import { formatElapsed } from '@/lib/quiz/scoring';
import { formatShortDateTime } from '@/lib/utils/time';
import type { AdminAuditEntry, Attempt, Participant } from '@/types/domain';

type InspectorPayload = {
  attempt: Attempt;
  participant: Participant | null;
  rank: number | null;
  audit: AdminAuditEntry[];
  questions: {
    display_order: number;
    code: string;
    pillar: Pillar;
    difficulty: Difficulty;
    question_text: string;
    options: { id: OptionId; text: string }[];
    correct_option_id: OptionId;
    explanation: string;
    selected_option_id: OptionId | null;
    answered_offset_ms: number | null;
    is_correct: boolean;
  }[];
};

/**
 * Full inspection of one attempt.
 *
 * The exact questions in the exact order they were served, what was chosen, what was correct and the
 * admin explanation. This is what settles a "the question was unfair" conversation at the desk.
 */
export function AttemptInspector({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const [data, setData] = useState<InspectorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiFetch<InspectorPayload>(`/api/admin/attempts/${attemptId}`);
      if (cancelled) return;
      if (result.ok) setData(result.data);
      else setError(result.error.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  return (
    <Modal title="Attempt detail" onClose={onClose} wide>
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : !data ? (
        <div className="py-10 text-center">
          <Spinner label="Loading attempt" />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Participant" value={data.participant?.full_name ?? '—'} />
            <Fact
              label="Score"
              value={`${data.attempt.correct_count ?? 0}/${data.questions.length}`}
            />
            <Fact label="Time" value={data.attempt.elapsed_ms !== null ? formatElapsed(data.attempt.elapsed_ms) : '—'} />
            <Fact label="Rank" value={data.rank !== null ? `#${data.rank}` : '—'} />
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
              Questions served
            </h3>
            <ol className="space-y-3">
              {data.questions.map((question) => (
                <li key={question.code} className="rounded-[var(--radius-md)] border border-[var(--color-hairline)] p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="numeric text-xs text-[var(--color-ink-faint)]">
                      Q{question.display_order + 1} · {question.code}
                    </span>
                    <Badge>{PILLAR_LABELS[question.pillar]}</Badge>
                    <Badge>{question.difficulty}</Badge>
                    {question.is_correct ? (
                      <Badge tone="success">
                        <Check aria-hidden className="h-3 w-3" />
                        Correct
                      </Badge>
                    ) : (
                      <Badge tone="danger">
                        <X aria-hidden className="h-3 w-3" />
                        {question.selected_option_id ? 'Incorrect' : 'Not answered'}
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-[var(--color-ink)]">{question.question_text}</p>

                  <ul className="mt-3 space-y-1.5">
                    {question.options.map((option) => {
                      const chosen = option.id === question.selected_option_id;
                      const correct = option.id === question.correct_option_id;
                      return (
                        <li
                          key={option.id}
                          className={[
                            'flex items-start gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm',
                            correct
                              ? 'bg-[color-mix(in_oklab,var(--color-success)_12%,transparent)] text-[var(--color-success)]'
                              : chosen
                                ? 'bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]'
                                : 'text-[var(--color-ink-muted)]',
                          ].join(' ')}
                        >
                          <span className="w-16 shrink-0 text-[0.7rem] uppercase">
                            {correct ? 'correct' : chosen ? 'chose' : ''}
                          </span>
                          <span>{option.text}</span>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="mt-3 text-xs italic text-[var(--color-ink-faint)]">{question.explanation}</p>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
              Audit history
            </h3>
            {data.audit.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-muted)]">No admin actions recorded for this attempt.</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-[var(--color-ink-muted)]">
                {data.audit.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap gap-2">
                    <span className="numeric text-xs text-[var(--color-ink-faint)]">
                      {formatShortDateTime(entry.created_at)}
                    </span>
                    <span className="text-[var(--color-ink)]">{entry.action}</span>
                    <span className="text-xs text-[var(--color-ink-faint)]">{entry.actor_label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">{label}</p>
      <p className="numeric mt-1 truncate text-sm font-medium text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
