import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSession, type AdminSession } from '@/lib/auth/admin-session';
import { failure, type ApiFailure } from '@/lib/api/respond';
import { getAdminSessionSecret, getAppUrl } from '@/lib/config/env';
import { isSameOrigin } from '@/lib/security/origin';

/**
 * Admin guard for route handlers.
 *
 * Middleware already blocks unauthenticated navigation to /admin pages, but every admin API re-checks
 * the session itself: middleware protects the door, this protects the safe. A route that forgot to
 * call this would otherwise be reachable directly.
 */

export type AdminGuardResult =
  | { ok: true; session: AdminSession; actor: string }
  | { ok: false; response: NextResponse<ApiFailure> };

export async function requireAdmin(request: Request, options: { mutating?: boolean } = {}): Promise<AdminGuardResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return { ok: false, response: failure('unauthorised', 'Please sign in again.', 401) };
  }

  const session = await verifyAdminSession(token, getAdminSessionSecret());
  if (!session) {
    return { ok: false, response: failure('unauthorised', 'Your admin session expired. Please sign in again.', 401) };
  }

  // CSRF: a state-changing admin request must come from our own origin.
  if (options.mutating && !isSameOrigin(request, getAppUrl())) {
    return { ok: false, response: failure('bad_origin', 'This request was blocked for security reasons.', 403) };
  }

  return { ok: true, session, actor: `event-admin:${session.sessionId}` };
}
