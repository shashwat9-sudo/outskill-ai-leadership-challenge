import 'server-only';
import { isDemoMode } from '@/lib/config/env';
import { DemoStore } from '@/lib/database/demo-store';
import { SupabaseStore } from '@/lib/database/supabase-store';
import type { DataStore } from '@/lib/database/store';

/**
 * Resolve the store for this request.
 *
 * Demo mode is an explicit, development-only opt-in. Production without Supabase configuration must
 * throw from `SupabaseStore` rather than quietly fall back to in-memory data — a booth that silently
 * captured 200 leads into a process that is about to restart would be far worse than a visible error.
 *
 * Instances are cached on `globalThis` rather than in module scope: Next.js bundles server components
 * and route handlers separately, so a module-level cache would build a second Supabase client (and,
 * in demo mode, a second set of data) per bundle.
 */

const STORE_KEY = Symbol.for('outskill.dataStore.v1');

type StoreGlobal = typeof globalThis & {
  [STORE_KEY]?: { demo?: DemoStore; supabase?: SupabaseStore };
};

export function getStore(): DataStore {
  const scope = globalThis as StoreGlobal;
  scope[STORE_KEY] ??= {};
  const cache = scope[STORE_KEY];

  if (isDemoMode()) {
    cache.demo ??= new DemoStore();
    return cache.demo;
  }

  cache.supabase ??= new SupabaseStore();
  return cache.supabase;
}

export { StoreError } from '@/lib/database/store';
export type { DataStore } from '@/lib/database/store';
