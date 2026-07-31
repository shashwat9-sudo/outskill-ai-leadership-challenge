import type { NextRequest } from 'next/server';
import { failure, guarded, ok, validationFailure } from '@/lib/api/respond';
import { adminCookieOptions, newSessionId, signAdminSession } from '@/lib/auth/admin-session';
import { checkAdminLoginRate, recordAdminLoginFailure } from '@/lib/auth/rate-limit';
import {
  getAdminPassword,
  getAdminSessionSecret,
  getAdminUsername,
  getAppUrl,
  secureCookiesEnabled,
} from '@/lib/config/env';
import { getStore } from '@/lib/database';
import { safeEqual } from '@/lib/security/hash';
import { isSameOrigin } from '@/lib/security/origin';
import { logger } from '@/lib/utils/logger';
import { adminLoginSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Event-admin login.
 *
 * One shared username and password for the whole booth team. Both are compared in constant time and
 * neither is ever logged, echoed or stored. Repeated failures from one hashed source are throttled so
 * the form cannot be brute-forced from the venue Wi-Fi, while successful logins are not counted —
 * booth staff sign in all day.
 *
 * Both comparisons always run: short-circuiting on a wrong username would leak, through timing, which
 * of the two fields was wrong.
 */
export async function POST(request: NextRequest) {
  return guarded('admin.login', async () => {
    if (!isSameOrigin(request, getAppUrl())) {
      return failure('bad_origin', 'This request was blocked for security reasons.', 403);
    }

    const store = getStore();
    const rate = await checkAdminLoginRate(store, request.headers);
    if (!rate.allowed) {
      logger.warn('admin.rate_limited', { count: rate.count, limit: rate.limit });
      return failure(
        'rate_limited',
        'Too many failed sign-in attempts. Please wait a few minutes and try again.',
        429,
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = adminLoginSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const usernameOk = safeEqual(parsed.data.username, getAdminUsername());
    const passwordOk = safeEqual(parsed.data.password, getAdminPassword());
    if (!usernameOk || !passwordOk) {
      await recordAdminLoginFailure(store, rate.ipHash);
      // Neither value is included in the log line — only that a failure happened, and how many.
      logger.warn('admin.login_failed', { attemptsInWindow: rate.count + 1 });
      // One message for either field, so nothing about the real credentials can be inferred.
      return failure('invalid_credentials', 'That username or password is not correct.', 401);
    }

    const sessionId = newSessionId();
    const token = await signAdminSession(sessionId, getAdminSessionSecret());

    logger.info('admin.login_succeeded', { sessionId });
    await store.recordAudit({
      action: 'admin.login',
      target_type: 'session',
      target_id: null,
      detail: { session_id: sessionId },
      actor_label: `event-admin:${sessionId}`,
    });

    const response = ok({ signed_in: true });
    response.cookies.set({ ...adminCookieOptions(secureCookiesEnabled()), value: token });
    return response;
  });
}
