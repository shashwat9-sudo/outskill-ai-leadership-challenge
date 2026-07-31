'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

/**
 * Admin error boundary.
 *
 * Unlike the public one, this shows the message: booth staff are trusted operators who need to know
 * whether the problem is a missing environment variable or an unreachable database. It still never
 * exposes raw database output — the message is already sanitised by the API layer.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5 text-center">
      <h1 className="text-2xl font-semibold">The admin screen could not load</h1>
      <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
        {error.message || 'An unexpected problem occurred.'}
      </p>
      {error.digest ? (
        <p className="numeric mt-4 rounded-[var(--radius-md)] border border-[var(--color-hairline)] px-3 py-1.5 text-xs text-[var(--color-ink-faint)]">
          Reference: {error.digest}
        </p>
      ) : null}

      <p className="mt-6 max-w-sm text-xs text-[var(--color-ink-faint)]">
        If this mentions a missing environment variable, check the deployment settings. The participant
        challenge may still be running normally.
      </p>

      <Button size="lg" onClick={reset} className="mt-7">
        <RotateCcw aria-hidden className="h-4 w-4" />
        Try again
      </Button>
    </main>
  );
}
