'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Download,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  Trophy,
  Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { Wordmark } from '@/components/ui/wordmark';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/admin/participants', label: 'Participants', icon: Users },
  { href: '/admin/questions', label: 'Questions', icon: ListChecks },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/export', label: 'Export', icon: Download },
] as const;

/** Chrome for every signed-in admin page: navigation, sign-out and a consistent page header. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await apiFetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin');
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[var(--color-hairline)] bg-[color-mix(in_oklab,var(--color-canvas)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Wordmark size="sm" />
            <span aria-hidden className="h-4 w-px bg-[var(--color-hairline-strong)]" />
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">Event admin</span>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] px-3 py-2 text-sm text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
          >
            <LogOut aria-hidden className="h-4 w-4" />
            Sign out
          </button>
        </div>

        <nav aria-label="Admin sections" className="mx-auto max-w-7xl px-5 sm:px-8">
          <ul className="scrollbar-none -mb-px flex gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors',
                      active
                        ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                        : 'border-transparent text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]',
                    ].join(' ')}
                  >
                    <item.icon aria-hidden className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-[var(--color-ink-muted)]">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
