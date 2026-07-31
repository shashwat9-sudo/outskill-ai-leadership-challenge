'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { QrCode, Save } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { Badge, Button, Card, Eyebrow, Spinner } from '@/components/ui/primitives';
import { SETTINGS_BOUNDS, type Difficulty } from '@/lib/config/constants';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/utils/time';
import type { AppSettings } from '@/types/domain';

type Payload = {
  settings: AppSettings;
  pool_health: { ok: boolean; messages: string[]; counts: Record<Difficulty, number> };
  environment: { ok: boolean; demoMode: boolean; missing: { variable: string; message: string }[] };
  store_kind: 'supabase' | 'demo';
};

/**
 * Event configuration.
 *
 * Numeric fields are bounded here and re-validated on the server: the question count in particular is
 * restricted to sizes that have a defined difficulty blueprint, so an edit can never silently break
 * the "2 easy / 4 medium / 1 hard" guarantee that keeps the leaderboard fair.
 */
export function SettingsView() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiFetch<Payload>('/api/admin/settings');
      if (result.ok) {
        setPayload(result.data);
        setForm(result.data.settings);
      } else {
        setError(result.error.message);
      }
    })();
  }, []);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    setSaving(true);
    setError(null);
    setFieldErrors({});

    const { id: _id, updated_at: _updatedAt, quiz_state: _quizState, ...editable } = form;

    const result = await apiFetch<{ settings: AppSettings }>('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(editable),
    });

    setSaving(false);

    if (!result.ok) {
      setFieldErrors(result.error.fields ?? {});
      setError(result.error.fields ? 'Some fields need attention.' : result.error.message);
      return;
    }

    setForm(result.data.settings);
    setSaved(true);
  }

  if (!form || !payload) {
    return (
      <div className="flex justify-center py-24">
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : <Spinner label="Loading settings" />}
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Event settings"
        description="Copy, timings, prizes and challenge configuration. Changes apply to the next visitor immediately."
        actions={
          <Link href="/qr" target="_blank">
            <Button variant="secondary">
              <QrCode aria-hidden className="h-4 w-4" />
              QR poster
            </Button>
          </Link>
        }
      />

      {payload.environment.missing.length > 0 ? (
        <div className="mb-5 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_8%,transparent)] p-5">
          <p className="text-sm font-semibold text-[var(--color-danger)]">Configuration incomplete</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-ink-muted)]">
            {payload.environment.missing.map((entry) => (
              <li key={entry.variable}>{entry.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="p-6">
          <Eyebrow>Public copy</Eyebrow>
          <div className="mt-4 grid gap-4">
            <Text label="Quiz title" value={form.quiz_title} onChange={(v) => set('quiz_title', v)} error={fieldErrors.quiz_title} />
            <Text label="Hook text" value={form.hook_text} onChange={(v) => set('hook_text', v)} error={fieldErrors.hook_text} />
            <Text label="Supporting line" value={form.supporting_line} onChange={(v) => set('supporting_line', v)} error={fieldErrors.supporting_line} />
            <Text label="Spin-the-wheel CTA" value={form.spin_cta_text} onChange={(v) => set('spin_cta_text', v)} error={fieldErrors.spin_cta_text} />
            <Text label="QR caption" value={form.qr_caption} onChange={(v) => set('qr_caption', v)} error={fieldErrors.qr_caption} />
          </div>
        </Card>

        <Card className="p-6">
          <Eyebrow>Event</Eyebrow>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Text label="Event name" value={form.event_name} onChange={(v) => set('event_name', v)} error={fieldErrors.event_name} />
            <Text label="Event location" value={form.event_location} onChange={(v) => set('event_location', v)} error={fieldErrors.event_location} />
            <DateTime label="Event start" value={form.event_start_at} onChange={(v) => set('event_start_at', v)} error={fieldErrors.event_start_at} />
            <DateTime label="Event end" value={form.event_end_at} onChange={(v) => set('event_end_at', v)} error={fieldErrors.event_end_at} />
            <DateTime
              label="Winner announcement"
              value={form.winner_announcement_at}
              onChange={(v) => set('winner_announcement_at', v)}
              error={fieldErrors.winner_announcement_at}
            />
          </div>
          <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
            Times are entered and displayed in the event timezone ({process.env.NEXT_PUBLIC_EVENT_TIMEZONE ?? 'Asia/Kolkata'}).
          </p>
        </Card>

        <Card className="p-6">
          <Eyebrow>Challenge configuration</Eyebrow>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Number
              label="Quiz duration (seconds)"
              value={form.quiz_duration_seconds}
              min={SETTINGS_BOUNDS.quizDurationSeconds.min}
              max={SETTINGS_BOUNDS.quizDurationSeconds.max}
              onChange={(v) => set('quiz_duration_seconds', v)}
              error={fieldErrors.quiz_duration_seconds}
            />
            <Number
              label="Questions per attempt"
              value={form.questions_per_attempt}
              min={SETTINGS_BOUNDS.questionsPerAttempt.min}
              max={SETTINGS_BOUNDS.questionsPerAttempt.max}
              onChange={(v) => set('questions_per_attempt', v)}
              error={fieldErrors.questions_per_attempt}
              hint="Only 5–10 are supported; each has a fixed difficulty mix."
            />
            <Number
              label="Leaderboard size"
              value={form.leaderboard_size}
              min={SETTINGS_BOUNDS.leaderboardSize.min}
              max={SETTINGS_BOUNDS.leaderboardSize.max}
              onChange={(v) => set('leaderboard_size', v)}
              error={fieldErrors.leaderboard_size}
            />
            <Number
              label="Result auto-reset (seconds)"
              value={form.result_auto_reset_seconds}
              min={SETTINGS_BOUNDS.resultAutoResetSeconds.min}
              max={SETTINGS_BOUNDS.resultAutoResetSeconds.max}
              onChange={(v) => set('result_auto_reset_seconds', v)}
              error={fieldErrors.result_auto_reset_seconds}
              hint="Kiosk tablets only."
            />
            <Number
              label="Leaderboard refresh (seconds)"
              value={form.leaderboard_refresh_seconds}
              min={SETTINGS_BOUNDS.leaderboardRefreshSeconds.min}
              max={SETTINGS_BOUNDS.leaderboardRefreshSeconds.max}
              onChange={(v) => set('leaderboard_refresh_seconds', v)}
              error={fieldErrors.leaderboard_refresh_seconds}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={payload.pool_health.ok ? 'success' : 'danger'}>
              Pool {payload.pool_health.ok ? 'healthy' : 'insufficient'}
            </Badge>
            <Badge>{payload.pool_health.counts.easy} easy</Badge>
            <Badge>{payload.pool_health.counts.medium} medium</Badge>
            <Badge>{payload.pool_health.counts.hard} hard</Badge>
          </div>
          {payload.pool_health.messages.map((message) => (
            <p key={message} className="mt-2 text-xs text-[var(--color-warning)]">
              {message}
            </p>
          ))}
        </Card>

        <Card className="p-6">
          <Eyebrow>Prizes</Eyebrow>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Text label="First" value={form.prize_first} onChange={(v) => set('prize_first', v)} error={fieldErrors.prize_first} />
            <Text label="Second" value={form.prize_second} onChange={(v) => set('prize_second', v)} error={fieldErrors.prize_second} />
            <Text label="Third" value={form.prize_third} onChange={(v) => set('prize_third', v)} error={fieldErrors.prize_third} />
          </div>
        </Card>

        <Card className="p-6">
          <Eyebrow>Legal copy</Eyebrow>
          <div className="mt-4 grid gap-4">
            <Text
              label="Privacy contact text"
              value={form.privacy_contact_text}
              onChange={(v) => set('privacy_contact_text', v)}
              error={fieldErrors.privacy_contact_text}
              hint="How a participant can reach Outskill about their data. Replace the placeholder with the real contact route."
            />
            <TextArea
              label="Privacy notice"
              value={form.privacy_notice_text}
              onChange={(v) => set('privacy_notice_text', v)}
              error={fieldErrors.privacy_notice_text}
              rows={7}
            />
            <TextArea
              label="Challenge rules"
              value={form.rules_text}
              onChange={(v) => set('rules_text', v)}
              error={fieldErrors.rules_text}
              rows={9}
              hint="One rule per line. Blank lines are ignored."
            />
          </div>
        </Card>

        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <div className="sticky bottom-4 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[color-mix(in_oklab,var(--color-canvas)_90%,transparent)] p-3 backdrop-blur">
          <Button type="submit" disabled={saving}>
            <Save aria-hidden className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
          {saved ? <span className="text-sm text-[var(--color-success)]">Saved.</span> : null}
        </div>
      </form>
    </>
  );
}

const inputClasses =
  'mt-1.5 w-full min-h-[2.75rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-3.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)]';

function Text({ label, value, onChange, error, hint }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} className={inputClasses} />
      {hint ? <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span> : null}
    </label>
  );
}

function TextArea({ label, value, onChange, error, rows = 4, hint }: { label: string; value: string; onChange: (v: string) => void; error?: string; rows?: number; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClasses} py-2.5`} />
      {hint ? <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span> : null}
    </label>
  );
}

function Number({ label, value, onChange, min, max, error, hint }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; error?: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(globalThis.Number(event.target.value))}
        className={`${inputClasses} numeric`}
      />
      {hint ? <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span> : null}
    </label>
  );
}

function DateTime({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <input
        type="datetime-local"
        value={toDateTimeLocalValue(value)}
        onChange={(event) => onChange(fromDateTimeLocalValue(event.target.value))}
        className={inputClasses}
      />
      {error ? <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span> : null}
    </label>
  );
}
