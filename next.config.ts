import type { NextConfig } from 'next';
import { servesOverHttps } from './src/lib/config/scheme';

/**
 * Content-Security-Policy.
 *
 * Next.js injects inline bootstrap scripts and React Server Component payloads, and Tailwind v4 emits
 * a style element, so 'unsafe-inline' is required for scripts and styles in the App Router today.
 * Everything else is locked to 'self'; there are no third-party scripts, fonts or trackers in this app.
 */
/**
 * `upgrade-insecure-requests` is only emitted when the site is actually served over HTTPS.
 *
 * On an http origin the directive rewrites every subresource URL to https. Chromium exempts
 * localhost, but WebKit does not — which breaks scripts, styles and fonts outright when the app runs
 * over plain http (local production builds, the E2E suite, a booth laptop serving on the LAN).
 * On a real HTTPS deployment it is emitted and does its job.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(servesOverHttps() ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
