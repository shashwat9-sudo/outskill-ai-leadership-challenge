import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/auth/admin-session';

/**
 * Gate every /admin page behind a valid signed session.
 *
 * The login page itself and the auth endpoints are exempt, otherwise nobody could ever sign in.
 * This is the first of two layers — each admin route handler independently calls `requireAdmin`.
 */

const PUBLIC_ADMIN_PATHS = ['/admin', '/api/admin/login', '/api/admin/logout'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.includes(pathname)) return NextResponse.next();

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;

  const session = token && secret ? await verifyAdminSession(token, secret) : null;
  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorised', message: 'Please sign in again.', requestId: 'middleware' } },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/admin', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
