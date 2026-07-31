import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/ui/wordmark';

/** Shared chrome for every participant-facing page: wordmark, event strip, and a quiet footer. */
export function PageFrame({
  children,
  eventName,
  eventLocation,
  showFooter = true,
  headerRight,
}: {
  children: ReactNode;
  eventName: string;
  eventLocation: string;
  showFooter?: boolean;
  headerRight?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-6">
        <Link href="/" className="flex items-center gap-3 rounded-[var(--radius-sm)]">
          <Wordmark size="sm" />
          <span aria-hidden className="h-4 w-px bg-[var(--color-hairline-strong)]" />
          <span className="hidden text-xs text-[var(--color-ink-faint)] sm:inline">
            {eventName} · {eventLocation}
          </span>
        </Link>
        {headerRight}
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      {showFooter ? (
        <footer className="hairline-top mt-10 px-5 py-6 sm:px-8">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-ink-faint)]">
            <p>© {new Date().getFullYear()} Outskill · {eventName}</p>
            <nav className="flex items-center gap-5">
              <Link href="/rules" className="transition-colors hover:text-[var(--color-ink)]">
                Challenge rules
              </Link>
              <Link href="/privacy" className="transition-colors hover:text-[var(--color-ink)]">
                Privacy notice
              </Link>
              <Link href="/leaderboard" className="transition-colors hover:text-[var(--color-ink)]">
                Leaderboard
              </Link>
            </nav>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
