import type { Metadata } from 'next';
import Link from 'next/link';
import { Monitor } from 'lucide-react';
import { PageFrame } from '@/components/ui/page-frame';
import { Eyebrow } from '@/components/ui/primitives';
import { LiveLeaderboard } from '@/components/leaderboard/live-leaderboard';
import { getStore } from '@/lib/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Live Leaderboard' };

export default async function LeaderboardPage() {
  const settings = await getStore().getSettings();

  return (
    <PageFrame
      eventName={settings.event_name}
      eventLocation={settings.event_location}
      headerRight={
        <Link
          href="/display"
          className="hidden items-center gap-1.5 text-xs text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)] sm:inline-flex"
        >
          <Monitor aria-hidden className="h-3.5 w-3.5" />
          LED display mode
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-4xl px-5 pb-14 pt-4 sm:px-8 sm:pt-8">
        <Eyebrow>{settings.event_name}</Eyebrow>
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Live Leaderboard</h1>
        <p className="mt-3 max-w-2xl text-[var(--color-ink-muted)]">
          Ranked by correct answers, then by completion time. Names appear only where a participant has
          opted in.
        </p>

        <div className="mt-10">
          <LiveLeaderboard initialRefreshSeconds={settings.leaderboard_refresh_seconds} />
        </div>
      </div>
    </PageFrame>
  );
}
