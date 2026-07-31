/**
 * CSRF defence for state-changing admin requests.
 *
 * The admin cookie is SameSite=Strict, which already blocks cross-site form posts in current browsers.
 * This is the second layer: an explicit check that the request claims to come from our own origin.
 */
export function isSameOrigin(request: Request, appUrl: string): boolean {
  const origin = request.headers.get('origin');

  // Same-origin fetch() from a browser always sends Origin on POST/PATCH/DELETE. A missing Origin
  // means a non-browser client, which must not be allowed to drive admin mutations.
  if (!origin) return false;

  const allowed = new Set<string>();
  try {
    allowed.add(new URL(appUrl).origin);
  } catch {
    // An unparseable NEXT_PUBLIC_APP_URL should not silently allow everything.
  }

  const host = request.headers.get('host');
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }

  return allowed.has(origin);
}
