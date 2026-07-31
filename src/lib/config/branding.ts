/**
 * Whether an official Outskill logo asset has been supplied.
 *
 * Checked at build/render time via an environment flag rather than by touching the filesystem, so the
 * same answer holds in a serverless runtime where `public/` is not readable at request time.
 *
 * To switch the wordmark to the official asset:
 *   1. place the file at `public/outskill-logo.svg`
 *   2. set `NEXT_PUBLIC_HAS_OFFICIAL_LOGO=1`
 *
 * This flag is intentionally public — it controls presentation only and contains no secret.
 */
export function hasOfficialLogo(): boolean {
  const flag = process.env.NEXT_PUBLIC_HAS_OFFICIAL_LOGO;
  return flag === '1' || flag?.toLowerCase() === 'true';
}
