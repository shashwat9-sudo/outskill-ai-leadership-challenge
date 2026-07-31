import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * One-way, salted hash of a client IP address.
 *
 * Raw IP addresses are never stored or logged. The hash is only ever used to count events per
 * source for abuse thresholds, so a keyed HMAC (not a bare SHA) is required — an unkeyed hash of the
 * small IPv4 space is trivially reversible.
 */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip.trim()).digest('hex').slice(0, 32);
}

/**
 * Best-effort client IP extraction behind Vercel / a proxy.
 * Returns a stable placeholder rather than throwing, so abuse counting still works locally.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

/** Constant-time string comparison that does not leak length through early exit. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    // Still burn a comparison so the timing profile does not depend on length alone.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
