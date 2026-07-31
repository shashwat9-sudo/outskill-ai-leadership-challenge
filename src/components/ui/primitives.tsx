import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

/**
 * The small set of building blocks every screen is made from.
 * Keeping them here is what stops eleven slightly different button styles appearing across the app.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'lg' | 'xl';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'accent-gradient text-[var(--color-canvas)] font-semibold hover:brightness-110 active:brightness-95 accent-glow',
  secondary:
    'bg-[var(--color-surface-2)] text-[var(--color-ink)] border border-[var(--color-hairline-strong)] hover:bg-[var(--color-surface-3)]',
  ghost: 'bg-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
  danger:
    'bg-transparent text-[var(--color-danger)] border border-[color-mix(in_oklab,var(--color-danger)_45%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)]',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'px-4 py-2.5 text-sm rounded-[var(--radius-md)] tap-target',
  lg: 'px-6 py-3.5 text-base rounded-[var(--radius-lg)] min-h-[3.25rem]',
  xl: 'px-8 py-5 text-lg rounded-[var(--radius-lg)] min-h-[3.75rem]',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-45 disabled:pointer-events-none ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    />
  );
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`surface ${className}`} />;
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-xs uppercase tracking-[0.24em] text-[var(--color-ink-faint)] ${className}`}>{children}</p>
  );
}

type StatProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
};

export function Stat({ label, value, hint, accent = false }: StatProps) {
  return (
    <div className="surface px-5 py-4">
      <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">{label}</p>
      <p
        className={`numeric mt-1.5 text-2xl font-semibold ${accent ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink)]'}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p> : null}
    </div>
  );
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-surface-3)] text-[var(--color-ink-muted)] border-[var(--color-hairline-strong)]',
  accent:
    'bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)] text-[var(--color-accent)] border-[color-mix(in_oklab,var(--color-accent)_40%,transparent)]',
  success:
    'bg-[color-mix(in_oklab,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_oklab,var(--color-success)_40%,transparent)]',
  warning:
    'bg-[color-mix(in_oklab,var(--color-warning)_14%,transparent)] text-[var(--color-warning)] border-[color-mix(in_oklab,var(--color-warning)_40%,transparent)]',
  danger:
    'bg-[color-mix(in_oklab,var(--color-danger)_14%,transparent)] text-[var(--color-danger)] border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)]',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Consistent empty state, so "no data yet" never looks like a broken screen. */
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-lg font-medium text-[var(--color-ink)]">{title}</p>
      <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">{description}</p>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-[var(--color-ink-muted)]">
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-hairline-strong)] border-t-[var(--color-accent)]"
      />
      <span className="text-sm">{label}</span>
    </span>
  );
}
