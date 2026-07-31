import type { Metadata } from 'next';
import { PageFrame } from '@/components/ui/page-frame';
import { Eyebrow } from '@/components/ui/primitives';
import { getStore } from '@/lib/database';
import { formatEventDateTime } from '@/lib/utils/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Challenge rules' };

export default async function RulesPage() {
  const settings = await getStore().getSettings();
  const rules = settings.rules_text.split('\n').filter((line) => line.trim().length > 0);

  return (
    <PageFrame eventName={settings.event_name} eventLocation={settings.event_location}>
      <article className="mx-auto w-full max-w-2xl px-5 pb-16 pt-4 sm:px-8 sm:pt-8">
        <Eyebrow>{settings.event_name}</Eyebrow>
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Challenge &amp; prize rules</h1>

        <ol className="mt-9 space-y-4">
          {rules.map((rule, index) => (
            <li key={index} className="surface flex gap-4 px-5 py-4">
              <span className="numeric mt-0.5 shrink-0 text-sm font-semibold text-[var(--color-accent)]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="leading-relaxed text-[var(--color-ink-muted)]">{rule}</span>
            </li>
          ))}
        </ol>

        <h2 className="mt-12 text-xl font-semibold">Prizes</h2>
        <dl className="mt-4 space-y-3">
          {[
            { place: 'First', prize: settings.prize_first },
            { place: 'Second', prize: settings.prize_second },
            { place: 'Third', prize: settings.prize_third },
          ].map((entry) => (
            <div key={entry.place} className="flex items-baseline justify-between gap-6 border-b border-[var(--color-hairline)] pb-3">
              <dt className="text-sm uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">{entry.place}</dt>
              <dd className="text-right text-[var(--color-ink)]">{entry.prize}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-10 text-xl font-semibold">Timings</h2>
        <p className="mt-4 leading-relaxed text-[var(--color-ink-muted)]">
          The challenge runs from {formatEventDateTime(settings.event_start_at)} to{' '}
          {formatEventDateTime(settings.event_end_at)} ({settings.event_location}). The winner is announced
          at the end of Day 2, on or around {formatEventDateTime(settings.winner_announcement_at)}.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What you receive</h2>
        <p className="mt-4 leading-relaxed text-[var(--color-ink-muted)]">
          Your number of correct answers out of {settings.questions_per_attempt}, your completion time, your
          position on the leaderboard, and a review of each of your {settings.questions_per_attempt} answers
          with the principle behind it. All of this appears on the tablet straight after you submit.
        </p>
        <p className="mt-4 leading-relaxed text-[var(--color-ink-muted)]">
          We do not email results, and no report is produced. This is a {settings.questions_per_attempt}-question
          booth challenge of your individual judgment — it is not a scientific assessment of you or of your
          organisation.
        </p>
      </article>
    </PageFrame>
  );
}
