import Link from 'next/link';
import { Button } from '@/components/ui/primitives';
import { Wordmark } from '@/components/ui/wordmark';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Wordmark size="sm" />
      <p className="numeric mt-10 text-7xl font-semibold text-[var(--color-ink-faint)]">404</p>
      <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">That page does not exist</h1>
      <p className="mt-3 max-w-sm text-[var(--color-ink-muted)]">
        The link may be out of date. Head back to the challenge, or ask the Outskill team at the booth.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/">
          <Button size="lg" className="w-full sm:w-auto">
            Take the Challenge
          </Button>
        </Link>
        <Link href="/leaderboard">
          <Button variant="secondary" size="lg" className="w-full sm:w-auto">
            View Leaderboard
          </Button>
        </Link>
      </div>
    </main>
  );
}
