import 'server-only';
import { servesOverHttps } from '@/lib/config/scheme';

/**
 * Lazy, validated access to server environment variables.
 *
 * Nothing here runs at module load. `next build` renders pages and collects route metadata without
 * production secrets available, so reading (and throwing on) them at import time would break the build.
 * Every accessor is a function, called only when a request actually needs the value.
 */

const MIN_SECRET_LENGTH = 32;

export class MissingEnvError extends Error {
  readonly variable: string;

  constructor(variable: string, hint: string) {
    super(`Missing or invalid environment variable ${variable}. ${hint}`);
    this.name = 'MissingEnvError';
    this.variable = variable;
  }
}

function read(name: string, hint: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new MissingEnvError(name, hint);
  }
  return value.trim();
}

function readSecret(name: string): string {
  const value = read(
    name,
    `Add it to .env.local (or to your Vercel project settings) with at least ${MIN_SECRET_LENGTH} characters. ` +
      `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
  );
  if (value.length < MIN_SECRET_LENGTH) {
    throw new MissingEnvError(name, `It must be at least ${MIN_SECRET_LENGTH} characters long.`);
  }
  return value;
}

/**
 * Demo mode is opt-in and development-only. It is deliberately impossible to enable in a production
 * deployment: production without Supabase configuration must fail loudly rather than serve fake data.
 */
export function isDemoMode(): boolean {
  const flag = process.env.DEMO_MODE;
  const enabled = flag === '1' || flag?.toLowerCase() === 'true';
  if (!enabled) return false;
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    throw new Error(
      'DEMO_MODE is set on a production deployment. Remove the DEMO_MODE environment variable ' +
        'and configure SUPABASE_URL and SUPABASE_SECRET_KEY instead.',
    );
  }
  return true;
}

export function getSupabaseUrl(): string {
  return read(
    'SUPABASE_URL',
    'Find it in Supabase → Project Settings → Data API → Project URL (looks like https://xxxx.supabase.co).',
  );
}

export function getSupabaseSecretKey(): string {
  return read(
    'SUPABASE_SECRET_KEY',
    'Find it in Supabase → Project Settings → API Keys → Secret keys. Never expose it to the browser.',
  );
}

/**
 * The shared booth-staff username. One account is deliberately shared by the six or seven admins
 * working the desk: every authenticated admin has every permission, and audit entries are written
 * against the shared identity plus the session id, never against a person.
 */
export function getAdminUsername(): string {
  if (isDemoMode()) {
    return process.env.ADMIN_USERNAME?.trim() || 'outskill-admin';
  }
  return read('ADMIN_USERNAME', 'The shared username booth staff type at /admin, e.g. outskill-admin.');
}

export function getAdminPassword(): string {
  if (isDemoMode()) {
    return process.env.ADMIN_PASSWORD?.trim() || process.env.DEMO_ADMIN_PASSWORD?.trim() || 'demo-admin';
  }
  return read('ADMIN_PASSWORD', 'Choose a long random password for booth staff to use at /admin.');
}

export function getAdminSessionSecret(): string {
  return readSecret('ADMIN_SESSION_SECRET');
}

export function getAttemptSigningSecret(): string {
  return readSecret('ATTEMPT_SIGNING_SECRET');
}

export function getIpHashSecret(): string {
  return readSecret('IP_HASH_SECRET');
}

export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}

/**
 * Whether the admin cookie should carry the `Secure` flag.
 *
 * Driven by the actual scheme rather than by NODE_ENV: a Secure cookie is silently discarded on an
 * http origin, so a production build served over http on a venue LAN would refuse every admin login
 * with no explanation. Every real deployment sets an https URL, so this stays on in production.
 */
export function secureCookiesEnabled(): boolean {
  return servesOverHttps(getAppUrl());
}

export type EnvCheckResult = {
  ok: boolean;
  demoMode: boolean;
  missing: { variable: string; message: string }[];
};

const REQUIRED_PRODUCTION_ACCESSORS: { variable: string; read: () => unknown }[] = [
  { variable: 'SUPABASE_URL', read: getSupabaseUrl },
  { variable: 'SUPABASE_SECRET_KEY', read: getSupabaseSecretKey },
  { variable: 'ADMIN_USERNAME', read: getAdminUsername },
  { variable: 'ADMIN_PASSWORD', read: getAdminPassword },
  { variable: 'ADMIN_SESSION_SECRET', read: getAdminSessionSecret },
  { variable: 'ATTEMPT_SIGNING_SECRET', read: getAttemptSigningSecret },
  { variable: 'IP_HASH_SECRET', read: getIpHashSecret },
];

/**
 * Runtime health check used by the admin dashboard and the smoke script. Never throws — it reports.
 */
export function checkEnvironment(): EnvCheckResult {
  const demoMode = (() => {
    try {
      return isDemoMode();
    } catch {
      return false;
    }
  })();

  const missing: { variable: string; message: string }[] = [];
  for (const accessor of REQUIRED_PRODUCTION_ACCESSORS) {
    // Supabase credentials are irrelevant while the in-memory demo store is serving requests.
    if (demoMode && accessor.variable.startsWith('SUPABASE_')) continue;
    try {
      accessor.read();
    } catch (error) {
      missing.push({
        variable: accessor.variable,
        message: error instanceof Error ? error.message : 'Unavailable.',
      });
    }
  }

  return { ok: missing.length === 0, demoMode, missing };
}
