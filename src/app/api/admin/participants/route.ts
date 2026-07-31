import type { NextRequest } from 'next/server';
import { guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { participantSearchSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Participant search by name, email, phone or participant id. */
export async function GET(request: NextRequest) {
  return guarded('admin.participants.search', async () => {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const parsed = participantSearchSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const rows = await store.searchParticipants(parsed.data.q, parsed.data.limit ?? 100);
    const settings = await store.getSettings();

    return ok({ participants: rows, questions_per_attempt: settings.questions_per_attempt });
  });
}
