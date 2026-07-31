import type { NextRequest } from 'next/server';
import { failure, guarded, ok } from '@/lib/api/respond';
import { adminCookieOptions } from '@/lib/auth/admin-session';
import { getAppUrl, secureCookiesEnabled } from '@/lib/config/env';
import { isSameOrigin } from '@/lib/security/origin';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return guarded('admin.logout', async () => {
    if (!isSameOrigin(request, getAppUrl())) {
      return failure('bad_origin', 'This request was blocked for security reasons.', 403);
    }

    logger.info('admin.logout');
    const response = ok({ signed_out: true });
    response.cookies.set({ ...adminCookieOptions(secureCookiesEnabled()), value: '', maxAge: 0 });
    return response;
  });
}
