'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client/api';
import { Modal } from '@/components/admin/admin-leaderboard-view';
import { Button } from '@/components/ui/primitives';
import {
  DIFFICULTIES,
  OPTION_IDS,
  PILLARS,
  PILLAR_LABELS,
  REVIEW_STATUSES,
  type Difficulty,
  type OptionId,
  type Pillar,
  type ReviewStatus,
} from '@/lib/config/constants';
import type { Question } from '@/types/domain';

export type QuestionFormValues = {
  code: string;
  pillar: Pillar;
  difficulty: Difficulty;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: OptionId;
  explanation: string;
  active: boolean;
  review_status: ReviewStatus;
};

const BLANK: QuestionFormValues = {
  code: '',
  pillar: 'business_judgment',
  difficulty: 'medium',
  question_text: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: 'a',
  explanation: '',
  active: true,
  review_status: 'draft',
};

function fromQuestion(question: Question): QuestionFormValues {
  const optionText = (id: OptionId) => question.options.find((option) => option.id === id)?.text ?? '';
  return {
    code: question.code,
    pillar: question.pillar,
    difficulty: question.difficulty,
    question_text: question.question_text,
    option_a: optionText('a'),
    option_b: optionText('b'),
    option_c: optionText('c'),
    option_d: optionText('d'),
    correct_option: question.correct_option_id,
    explanation: question.explanation,
    active: question.active,
    review_status: question.review_status,
  };
}

/**
 * Create / edit a question.
 *
 * Deactivating is how a question is archived — rows are never deleted, because an inactive question
 * may still be referenced by attempts already sitting on the leaderboard.
 */
export function QuestionEditor({
  mode,
  question,
  initial,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  question?: Question;
  initial?: QuestionFormValues;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<QuestionFormValues>(
    question ? fromQuestion(question) : (initial ?? BLANK),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof QuestionFormValues>(key: K, value: QuestionFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const result =
      mode === 'edit' && question
        ? await apiFetch(`/api/admin/questions/${question.id}`, { method: 'PUT', body: JSON.stringify(values) })
        : await apiFetch('/api/admin/questions', { method: 'POST', body: JSON.stringify(values) });

    setSaving(false);

    if (!result.ok) {
      setFieldErrors(result.error.fields ?? {});
      setError(result.error.fields ? null : result.error.message);
      return;
    }
    onSaved();
  }

  return (
    <Modal title={mode === 'edit' ? `Edit ${question?.code ?? 'question'}` : 'New question'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Text label="Code" value={values.code} onChange={(value) => set('code', value)} error={fieldErrors.code} />
          <Select
            label="Pillar"
            value={values.pillar}
            onChange={(value) => set('pillar', value as Pillar)}
            options={PILLARS.map((pillar) => ({ value: pillar, label: PILLAR_LABELS[pillar] }))}
          />
          <Select
            label="Difficulty"
            value={values.difficulty}
            onChange={(value) => set('difficulty', value as Difficulty)}
            options={DIFFICULTIES.map((difficulty) => ({ value: difficulty, label: difficulty }))}
          />
        </div>

        <TextArea
          label="Question text"
          value={values.question_text}
          onChange={(value) => set('question_text', value)}
          error={fieldErrors.question_text}
          hint="Aim for under 35 words. A realistic executive decision, not a definition."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {OPTION_IDS.map((id) => (
            <Text
              key={id}
              label={`Option ${id.toUpperCase()}`}
              value={values[`option_${id}` as const]}
              onChange={(value) => set(`option_${id}` as const, value)}
              error={fieldErrors[`option_${id}`]}
            />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Correct option"
            value={values.correct_option}
            onChange={(value) => set('correct_option', value as OptionId)}
            options={OPTION_IDS.map((id) => ({ value: id, label: id.toUpperCase() }))}
          />
          <Select
            label="Review status"
            value={values.review_status}
            onChange={(value) => set('review_status', value as ReviewStatus)}
            options={REVIEW_STATUSES.map((status) => ({ value: status, label: status }))}
          />
          <label className="flex items-end gap-2.5 pb-2.5 text-sm text-[var(--color-ink-muted)]">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(event) => set('active', event.target.checked)}
              className="h-5 w-5 rounded-[6px] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] accent-[var(--color-accent)]"
            />
            Active (served to participants)
          </label>
        </div>

        <TextArea
          label="Explanation (admin only)"
          value={values.explanation}
          onChange={(value) => set('explanation', value)}
          error={fieldErrors.explanation}
          hint="Why this answer is strongest. Never shown to participants during the event."
        />

        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create question'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const inputClasses =
  'mt-1.5 w-full min-h-[2.75rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-3.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)]';

function Text({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} className={inputClasses} />
      {error ? <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span> : null}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClasses} py-2.5`}
      />
      {hint ? <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span> : null}
    </label>
  );
}

function Select({
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
    <label className="block text-sm">
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClasses}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
