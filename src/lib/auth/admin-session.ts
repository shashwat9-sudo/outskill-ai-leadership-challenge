import { SignJWT, jwtVerify } from 'jose';
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_TTL_SECONDS } from '@/lib/config/constants';

/**
 * Admin session cookie.
 *
 * Deliberately built on `jose` only (no node:crypto) so the same verification runs in middleware on
 * the Edge runtime and inside Node route handlers, with no second implementation to keep in sync.
 *
 * The cookie is HttpOnly + SameSite=Strict + Secure in production, and carries no privileges of its
 * own: it asserts "this browser proved knowledge of ADMIN_PASSWORD at time X", nothing more.
 */

const ISSUER = 'outskill-ai-leadership-challenge';
const AUDIENCE = 'admin';
const ALGORITHM = 'HS256';

export type AdminSession = {
  /** Short random id, used as the actor label in the audit log so sessions can be told apart. */
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};

export async function signAdminSession(
  sessionId: string,
  secret: string,
  ttlSeconds: number = ADMIN_SESSION_TTL_SECONDS,
  nowMs: number = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(nowMs / 1000);
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyAdminSession(token: string, secret: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });
    const sessionId = payload.sid;
    if (typeof sessionId !== 'string' || !payload.iat || !payload.exp) return null;
    return { sessionId, issuedAt: payload.iat, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

/** Cookie attributes shared by the login and logout handlers, so they cannot drift apart. */
export function adminCookieOptions(secure: boolean) {
  return {
    name: ADMIN_SESSION_COOKIE,
    httpOnly: true,
    sameSite: 'strict' as const,
    secure,
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  };
}

/** A short, non-guessable label for the audit log. Never derived from the password. */
export function newSessionId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export { ADMIN_SESSION_COOKIE };
