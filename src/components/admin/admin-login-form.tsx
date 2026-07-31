'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { Button } from '@/components/ui/primitives';

/**
 * Admin sign-in.
 *
 * One shared username and password for the whole booth team. Neither credential is placed in a URL,
 * the server never echoes them back, and a failure always says the same thing regardless of which
 * field was wrong.
 */
export function AdminLoginForm() {
  const usernameId = useId();
  const passwordId = useId();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    setSubmitting(false);
    setPassword('');

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    const next = searchParams.get('next');
    router.push(next && next.startsWith('/admin') ? next : '/admin/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor={usernameId} className="mb-2 block text-sm font-medium">
          Admin username
        </label>
        <input
          id={usernameId}
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full min-h-[3.25rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-4 text-base text-[var(--color-ink)] transition-colors focus:border-[var(--color-accent)]"
          aria-invalid={Boolean(error)}
        />
      </div>

      <div>
        <label htmlFor={passwordId} className="mb-2 block text-sm font-medium">
          Admin password
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full min-h-[3.25rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-4 text-base text-[var(--color-ink)] transition-colors focus:border-[var(--color-accent)]"
          aria-invalid={Boolean(error)}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting ? (
          <>
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Signing in…
          </>
        ) : (
          <>
            <LogIn aria-hidden className="h-4 w-4" />
            Sign in
          </>
        )}
      </Button>
    </form>
  );
}
