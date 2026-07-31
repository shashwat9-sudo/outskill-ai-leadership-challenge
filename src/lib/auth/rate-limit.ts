import 'server-only';
import { RATE_LIMITS, type RateLimitAction } from '@/lib/config/constants';
import { getIpHashSecret } from '@/lib/config/env';
import { clientIpFrom, hashIp } from '@/lib/security/hash';
import type { DataStore } from '@/lib/database/store';

/**
 * Abuse thresholds for a venue where ~10,000 attendees share one Wi-Fi network.
 *
 * The thresholds in RATE_LIMITS are deliberately high. A hard "one attempt per IP" rule would lock
 * out an entire conference hall, so the design instead pairs generous automated limits with the
 * controls that actually decide the prize: unique email, unique phone, one live attempt per
 * participant, in-person verification of the top 10, and admin disqualification.
 */

export type RateLimitVerdict = {
  allowed: boolean;
  ipHash: string;
  count: number;
  limit: number;
};

export function hashRequestIp(headers: Headers): string {
  return hashIp(clientIpFrom(headers), getIpHashSecret());
}

/**
 * Count recent events for this source and decide whether to allow another.
 * Records the event when allowed, so the counter reflects accepted traffic.
 */
export async function checkRateLimit(
  store: DataStore,
  action: RateLimitAction,
  headers: Headers,
): Promise<RateLimitVerdict> {
  const { limit, windowSeconds } = RATE_LIMITS[action];
  const ipHash = hashRequestIp(headers);

  const count = await store.countRateEvents(action, ipHash, windowSeconds);
  if (count >= limit) {
    return { allowed: false, ipHash, count, limit };
  }

  await store.recordRateEvent(action, ipHash);
  return { allowed: true, ipHash, count: count + 1, limit };
}

/**
 * Failed-login counting for the admin form. Only failures are recorded, so a booth manager logging in
 * repeatedly through the day is never locked out.
 */
export async function checkAdminLoginRate(store: DataStore, headers: Headers): Promise<RateLimitVerdict> {
  const { limit, windowSeconds } = RATE_LIMITS.adminLogin;
  const ipHash = hashRequestIp(headers);
  const count = await store.countRateEvents('adminLogin', ipHash, windowSeconds);
  return { allowed: count < limit, ipHash, count, limit };
}

export async function recordAdminLoginFailure(store: DataStore, ipHash: string): Promise<void> {
  await store.recordRateEvent('adminLogin', ipHash);
}
