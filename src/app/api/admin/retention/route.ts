import type { NextRequest } from 'next/server';
import { failure, guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { ANONYMISE_CONFIRMATION, RETENTION_DAYS } from '@/lib/config/constants';
import { getAdminPassword } from '@/lib/config/env';
import { getStore } from '@/lib/database';
import { safeEqual } from '@/lib/security/hash';
import { logger } from '@/lib/utils/logger';
import { anonymiseSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Retention status and the anonymisation workflow.
 *
 * Nothing here happens on a schedule. The GET reports where the event stands against the seven-day
 * retention commitment; the POST performs the irreversible anonymisation, and only when an
 * administrator has re-entered the shared password *and* typed the confirmation phrase.
 *
 * The audit entry deliberately records counts only — writing participant names or addresses into the
 * audit log at the moment you are removing them from the database would defeat the whole exercise.
 */
export async function GET(request: NextRequest) {
  return guarded('admin.retention.status', async () => {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const store = getStore();
    const [settings, counts, audit] = await Promise.all([
      store.getSettings(),
      store.countAnonymisedParticipants(),
      store.listAudit(200),
    ]);

    const eventEndMs = Date.parse(settings.event_end_at);
    const deadlineMs = eventEndMs + RETENTION_DAYS * DAY_MS;
    const lastExport = audit.find((entry) => entry.action === 'csv.exported') ?? null;
    const lastAnonymisation = audit.find((entry) => entry.action === 'participants.anonymised') ?? null;

    return ok({
      event_end_at: settings.event_end_at,
      retention_days: RETENTION_DAYS,
      retention_deadline_at: new Date(deadlineMs).toISOString(),
      // Negative once the deadline has passed, which the UI renders as overdue rather than as "0".
      days_remaining: Math.ceil((deadlineMs - Date.now()) / DAY_MS),
      total_participants: counts.total,
      anonymised_participants: counts.anonymised,
      fully_anonymised: counts.total > 0 && counts.anonymised === counts.total,
      export_completed: lastExport !== null,
      last_export_at: lastExport?.created_at ?? null,
      last_anonymised_at: lastAnonymisation?.created_at ?? null,
      confirmation_phrase: ANONYMISE_CONFIRMATION,
    });
  });
}

export async function POST(request: NextRequest) {
  return guarded('admin.retention.anonymise', async () => {
    const guard = await requireAdmin(request, { mutating: true });
    if (!guard.ok) return guard.response;

    const body: unknown = await request.json().catch(() => null);
    const parsed = anonymiseSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error);

    if (parsed.data.confirmation !== ANONYMISE_CONFIRMATION) {
      return failure(
        'confirmation_required',
        `Type "${ANONYMISE_CONFIRMATION}" exactly to confirm. This cannot be undone.`,
        400,
      );
    }

    // Re-entering the shared password is the second factor here: an admin session left open on a
    // booth laptop must not be enough to erase the lead list on its own.
    if (!safeEqual(parsed.data.password, getAdminPassword())) {
      logger.warn('retention.anonymise_rejected', { reason: 'bad_password' });
      return failure('invalid_credentials', 'That password is not correct.', 401);
    }

    const store = getStore();
    const result = await store.anonymiseParticipants();

    logger.info('participants.anonymised', {
      anonymised: result.anonymised,
      alreadyAnonymised: result.alreadyAnonymised,
      actor: guard.actor,
    });
    await store.recordAudit({
      action: 'participants.anonymised',
      target_type: 'participants',
      target_id: null,
      // Counts only — never a name, an address or an id.
      detail: { anonymised: result.anonymised, already_anonymised: result.alreadyAnonymised },
      actor_label: guard.actor,
    });

    return ok(result);
  });
}
