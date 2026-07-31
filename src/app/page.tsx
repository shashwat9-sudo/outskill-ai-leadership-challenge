import Link from 'next/link';
import { ArrowRight, Gift, Trophy } from 'lucide-react';
import { PageFrame } from '@/components/ui/page-frame';
import { Button, Eyebrow } from '@/components/ui/primitives';
import { LiveAttractionStats } from '@/components/participant/live-attraction-stats';
import { getStore } from '@/lib/database';
import { formatEventDay } from '@/lib/utils/time';

export const dynamic = 'force-dynamic';

/**
 * The attraction screen.
 *
 * Restrained on purpose: one headline, one promise, one button. At a booth this competes with a room
 * full of noise, so the hierarchy has to survive being read from three metres away in two seconds.
 */
export default async function LandingPage() {
  const store = getStore();
  const settings = await store.getSettings();

  return (
    <PageFrame eventName={settings.event_name} eventLocation={settings.event_location}>
      <div className="mx-auto flex max-w-5xl flex-col px-5 pb-14 pt-4 sm:px-8 sm:pt-10">
        <section className="animate-fade-up">
          <Eyebrow>Outskill at {settings.event_name}</Eyebrow>

          <h1 className="mt-5 text-[2.6rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
            {settings.quiz_title}
          </h1>

          <p className="mt-6 max-w-2xl text-xl text-[var(--color-ink)] sm:text-2xl">{settings.hook_text}</p>

          <p className="mt-3 text-base text-[var(--color-ink-muted)] sm:text-lg">{settings.supporting_line}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/challenge" className="sm:w-auto">
              <Button size="xl" className="w-full sm:w-auto">
                Take the Challenge
                <ArrowRight aria-hidden className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/leaderboard" className="sm:w-auto">
              <Button size="xl" variant="secondary" className="w-full sm:w-auto">
                <Trophy aria-hidden className="h-5 w-5" />
                View Live Leaderboard
              </Button>
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <LiveAttractionStats />
        </section>

        <section className="surface mt-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex items-start gap-4">
            <span className="accent-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)]">
              <Gift aria-hidden className="h-5 w-5 text-[var(--color-canvas)]" />
            </span>
            <div>
              <Eyebrow>Top prize</Eyebrow>
              <p className="mt-1.5 text-lg font-medium text-[var(--color-ink)]">{settings.prize_first}</p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Second: {settings.prize_second} · Third: {settings.prize_third}
              </p>
            </div>
          </div>

          <div className="sm:text-right">
            <Eyebrow>Winner announced</Eyebrow>
            <p className="mt-1.5 text-sm font-medium text-[var(--color-accent)]">
              At the end of Day 2 · {formatEventDay(settings.winner_announcement_at)}
            </p>
          </div>
        </section>

        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-faint)]">
          The challenge measures your individual judgment on seven workplace AI decisions. It is not an
          assessment of your organisation&rsquo;s AI readiness, and no report is produced. You will see your
          score, your time and your leaderboard position.{' '}
          <Link href="/rules" className="text-[var(--color-ink-muted)] underline underline-offset-4 hover:text-[var(--color-ink)]">
            Read the full rules
          </Link>
          .
        </p>
      </div>
    </PageFrame>
  );
}
