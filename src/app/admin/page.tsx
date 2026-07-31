import type { Metadata } from 'next';
import { AdminLoginForm } from '@/components/admin/admin-login-form';
import { Wordmark } from '@/components/ui/wordmark';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Event admin' };

export default function AdminLoginPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          <Wordmark size="sm" />
          <span aria-hidden className="h-4 w-px bg-[var(--color-hairline-strong)]" />
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">Event admin</span>
        </div>

        <h1 className="mt-8 text-3xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          For Outskill booth staff. Use the event admin password.
        </p>

        <div className="mt-8">
          <AdminLoginForm />
        </div>
      </div>
    </main>
  );
}
