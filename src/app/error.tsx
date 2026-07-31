'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { Wordmark } from '@/components/ui/wordmark';

/**
 * Public error boundary.
 *
 * A visitor sees a sentence and a digest code they can read out to booth staff; the detail is already
 * in the server log against the same digest. No stack trace, no database message, ever.
 */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The server has already logged the cause. This is only so the digest is visible in a browser
    // console if someone is debugging a booth tablet on the spot.
    console.error('[challenge] render error', error.digest ?? 'no-digest');
  }, [error]);

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Wordmark size="sm" />
      <h1 className="mt-10 text-2xl font-semibold sm:text-3xl">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-[var(--color-ink-muted)]">
        The challenge hit an unexpected problem. Try again — if it keeps happening, please show this
        screen to the Outskill team.
      </p>

      {error.digest ? (
        <p className="numeric mt-4 rounded-[var(--radius-md)] border border-[var(--color-hairline)] px-3 py-1.5 text-xs text-[var(--color-ink-faint)]">
          Reference: {error.digest}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={reset} className="w-full sm:w-auto">
          <RotateCcw aria-hidden className="h-4 w-4" />
          Try again
        </Button>
        <Link href="/">
          <Button variant="secondary" size="lg" className="w-full sm:w-auto">
            Back to start
          </Button>
        </Link>
      </div>
    </main>
  );
}
