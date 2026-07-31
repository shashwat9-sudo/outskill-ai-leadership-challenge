import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { MissingEnvError } from '@/lib/config/env';
import { StoreError } from '@/lib/database/store';
import { logger, newRequestId } from '@/lib/utils/logger';

/**
 * A single response shape for every endpoint, and a single place where an internal failure is turned
 * into something a visitor can read.
 *
 * Two rules hold everywhere: database messages never reach the browser, and every failure gets a
 * request id that also appears in the server log, so booth staff can quote it and it can be found.
 */

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { code: string; message: string; requestId: string; fields?: Record<string, string> } };

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function failure(
  code: string,
  message: string,
  status: number,
  extra?: { fields?: Record<string, string>; requestId?: string },
): NextResponse<ApiFailure> {
  const requestId = extra?.requestId ?? newRequestId();
  return NextResponse.json(
    { ok: false, error: { code, message, requestId, ...(extra?.fields ? { fields: extra.fields } : {}) } },
    { status },
  );
}

/** Field-level messages for a form, keyed by input name. */
export function validationFailure(error: ZodError): NextResponse<ApiFailure> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    fields[key] ??= issue.message;
  }
  const first = Object.values(fields)[0] ?? 'Please check the details you entered.';
  return failure('validation_failed', first, 400, { fields });
}

/**
 * Last-resort handler for anything a route did not anticipate.
 * The detail goes to the log; the visitor gets a sentence and an id.
 */
export function unexpectedFailure(error: unknown, context: string): NextResponse<ApiFailure> {
  const requestId = newRequestId();

  if (error instanceof MissingEnvError) {
    logger.error('api.error', { context, requestId, reason: 'missing_env', variable: error.variable });
    return failure(
      'not_configured',
      'The challenge is not fully configured yet. Please tell the Outskill team.',
      503,
      { requestId },
    );
  }

  if (error instanceof StoreError) {
    logger.error('api.error', { context, requestId, reason: `store_${error.code}`, detail: error.message });
    const status = error.code === 'not_found' ? 404 : error.code === 'invalid_state' ? 409 : 503;
    const message =
      error.code === 'unavailable'
        ? 'We could not reach the challenge database. Please try again in a moment.'
        : error.message;
    return failure(`store_${error.code}`, message, status, { requestId });
  }

  logger.error('api.error', {
    context,
    requestId,
    reason: 'unhandled',
    detail: error instanceof Error ? error.message : String(error),
  });
  return failure(
    'unexpected_error',
    'Something went wrong at our end. Please try again, or speak to the Outskill team.',
    500,
    { requestId },
  );
}

/** Wrap a route handler so no unhandled error can ever escape as a stack trace. */
export async function guarded(context: string, handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return unexpectedFailure(error, context);
  }
}

/** Public endpoints are always live; a cached leaderboard at a live event is worse than no leaderboard. */
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;
