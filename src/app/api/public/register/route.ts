import type { NextRequest } from 'next/server';
import type { CountryCode } from 'libphonenumber-js';
import { failure, guarded, ok, validationFailure, NO_STORE_HEADERS } from '@/lib/api/respond';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { getAttemptSigningSecret } from '@/lib/config/env';
import { getStore } from '@/lib/database';
import { signParticipantToken } from '@/lib/security/tokens';
import { DEFAULT_PHONE_COUNTRY, isValidEmail, normaliseEmail, normaliseName, normalisePhone } from '@/lib/utils/identity';
import { logger } from '@/lib/utils/logger';
import { registerSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Registration.
 *
 * Registering does NOT start the timer — that only happens at /api/public/start, after the
 * instructions screen. This endpoint returns a short-lived participant token and nothing else.
 */
export async function POST(request: NextRequest) {
  return guarded('public.register', async () => {
    const store = getStore();
    const settings = await store.getSettings();

    if (settings.quiz_state === 'locked') {
      logger.info('registration.blocked_locked');
      return failure(
        'quiz_locked',
        'The challenge is now closed. Thank you for visiting the Outskill booth.',
        409,
      );
    }
    if (settings.quiz_state === 'paused') {
      return failure(
        'quiz_paused',
        'The challenge is paused for a moment. Please ask the Outskill team when it reopens.',
        409,
      );
    }

    const rate = await checkRateLimit(store, 'register', request.headers);
    if (!rate.allowed) {
      logger.warn('registration.rate_limited', { count: rate.count, limit: rate.limit });
      return failure(
        'rate_limited',
        'We are seeing a lot of activity from this connection. Please wait a moment and try again.',
        429,
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    const input = parsed.data;

    if (!isValidEmail(input.email)) {
      return failure('validation_failed', 'Please enter a valid email address.', 400, {
        fields: { email: 'Please enter a valid email address.' },
      });
    }

    const phone = normalisePhone(input.phone, (input.phone_country as CountryCode | undefined) ?? DEFAULT_PHONE_COUNTRY);
    if (!phone.ok) {
      return failure('validation_failed', 'Please enter a valid mobile number.', 400, {
        fields: { phone: 'Please enter a valid mobile number, including the country code if outside India.' },
      });
    }

    const result = await store.registerParticipant({
      full_name: normaliseName(input.full_name),
      email: input.email.trim(),
      email_normalized: normaliseEmail(input.email),
      phone_original: input.phone.trim(),
      phone_e164: phone.e164,
      company_name: input.company_name,
      designation: input.designation,
      public_leaderboard_opt_in: input.public_leaderboard_opt_in,
      marketing_opt_in: input.marketing_opt_in,
    });

    if (result.duplicate) {
      // The message is identical whether the email or the phone matched. Telling a visitor which one
      // it was would turn this form into a lookup tool for other people's contact details.
      logger.info('registration.blocked_duplicate', { participantId: result.participantId ?? 'unknown' });
      return failure(
        'duplicate_participant',
        'It looks like you have already entered the challenge. Please speak to the Outskill team if you experienced a technical issue.',
        409,
      );
    }

    if (!result.participantId) {
      return failure('registration_failed', 'We could not complete your registration. Please try again.', 503);
    }

    const token = await signParticipantToken(result.participantId, getAttemptSigningSecret());
    logger.info('registration.accepted', {
      participantId: result.participantId,
      publicOptIn: input.public_leaderboard_opt_in,
      marketingOptIn: input.marketing_opt_in,
    });

    return ok(
      {
        participant_token: token,
        questions_per_attempt: settings.questions_per_attempt,
        quiz_duration_seconds: settings.quiz_duration_seconds,
      },
      { headers: NO_STORE_HEADERS },
    );
  });
}
