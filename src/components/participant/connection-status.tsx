'use client';

import { useEffect, useState } from 'react';
import { CloudOff, Wifi, WifiOff } from 'lucide-react';

/**
 * Connection indicator.
 *
 * `navigator.onLine` only tells us the device has *a* network, so it is paired with a signal from the
 * caller about whether our own requests are actually succeeding. A participant mid-run needs to know
 * their answers are safe, which is a different question from whether Wi-Fi is connected.
 */
export type ConnectionState = 'online' | 'offline' | 'unstable';

export function useOnlineState(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

export function ConnectionBanner({ state }: { state: ConnectionState }) {
  if (state === 'online') return null;

  const offline = state === 'offline';

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-warning)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-warning)_10%,transparent)] px-4 py-2.5 text-sm text-[var(--color-warning)]"
    >
      {offline ? <WifiOff aria-hidden className="h-4 w-4 shrink-0" /> : <CloudOff aria-hidden className="h-4 w-4 shrink-0" />}
      <span>
        {offline
          ? 'You are offline. Keep answering — your answers are saved on this device and sent when the connection returns.'
          : 'The connection is unstable. Your answers are safe on this device.'}
      </span>
    </div>
  );
}

export function ConnectionPill({ state }: { state: ConnectionState }) {
  const tone =
    state === 'online'
      ? 'text-[var(--color-ink-faint)]'
      : state === 'unstable'
        ? 'text-[var(--color-warning)]'
        : 'text-[var(--color-danger)]';

  const Icon = state === 'online' ? Wifi : state === 'unstable' ? CloudOff : WifiOff;
  const label = state === 'online' ? 'Connected' : state === 'unstable' ? 'Unstable' : 'Offline';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${tone}`} role="status" aria-live="polite">
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
