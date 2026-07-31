import { FlaskConical } from 'lucide-react';
import { isDemoMode } from '@/lib/config/env';

/**
 * Always-visible marker that the data on screen is fake.
 *
 * Rendered from a server component so the flag is read on the server and cannot be faked from the
 * browser. It is fixed to the viewport so it survives on every screen, including the LED display.
 */
export function DemoModeBadge() {
  let demo = false;
  try {
    demo = isDemoMode();
  } catch {
    // isDemoMode throws only when DEMO_MODE is set on a production deployment, which the store also
    // refuses. Rendering no badge here lets that clearer error surface from the data layer.
    demo = false;
  }

  if (!demo) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2 print:hidden"
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_16%,var(--color-canvas))] px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-warning)] backdrop-blur">
        <FlaskConical aria-hidden className="h-3.5 w-3.5" />
        Demo mode — sample data
      </span>
    </div>
  );
}
