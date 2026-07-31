/**
 * Outskill wordmark.
 *
 * If an official logo file is present at `public/outskill-logo.svg` it is used as-is. Otherwise this
 * renders a tasteful text wordmark. The official mark is deliberately NOT redrawn here — drop the real
 * asset in at that path and this component will pick it up with no code change.
 *
 * See `public/README.md` for the exact filename and sizing guidance.
 */

import Image from 'next/image';
import { hasOfficialLogo } from '@/lib/config/branding';

type WordmarkProps = {
  /** Visual scale. `lg` is used on the LED display, `sm` in dense admin chrome. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const TEXT_SIZE: Record<NonNullable<WordmarkProps['size']>, string> = {
  sm: 'text-sm tracking-[0.28em]',
  md: 'text-base tracking-[0.3em]',
  lg: 'text-3xl tracking-[0.32em]',
};

const IMAGE_HEIGHT: Record<NonNullable<WordmarkProps['size']>, number> = {
  sm: 18,
  md: 24,
  lg: 56,
};

export function Wordmark({ size = 'md', className = '' }: WordmarkProps) {
  if (hasOfficialLogo()) {
    return (
      <Image
        src="/outskill-logo.svg"
        alt="Outskill"
        height={IMAGE_HEIGHT[size]}
        width={IMAGE_HEIGHT[size] * 4}
        className={`h-auto w-auto ${className}`}
        priority
      />
    );
  }

  return (
    <span
      className={`font-semibold uppercase text-[var(--color-ink)] ${TEXT_SIZE[size]} ${className}`}
      aria-label="Outskill"
    >
      Outskill
    </span>
  );
}
