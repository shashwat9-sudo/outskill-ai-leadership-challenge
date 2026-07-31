/**
 * Is this deployment actually served over HTTPS?
 *
 * Two things depend on the answer, and both break subtly if it is guessed from NODE_ENV instead:
 *
 *  - the `Secure` flag on the admin session cookie. A Secure cookie is silently discarded by the
 *    browser on an http origin, so an operator running a production build over http on a venue LAN
 *    would be unable to sign in at all, with no error to explain why.
 *  - the `upgrade-insecure-requests` CSP directive, which rewrites every subresource URL to https.
 *    On an http origin that breaks scripts, styles and fonts outright in strict browsers.
 *
 * Deriving it from the configured public URL means both follow reality. Every real deployment sets an
 * https URL (and Vercel sets VERCEL), so production keeps both protections.
 *
 * Deliberately free of imports and of `server-only`, so `next.config.ts` can use it too.
 */
export function servesOverHttps(appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL): boolean {
  if (process.env.VERCEL) return true;
  return (appUrl ?? '').trim().toLowerCase().startsWith('https://');
}
