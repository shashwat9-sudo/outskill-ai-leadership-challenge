import type { NextRequest } from 'next/server';
import { guarded, ok, validationFailure } from '@/lib/api/respond';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getStore } from '@/lib/database';
import { auditQuerySchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return guarded('admin.audit', async () => {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const parsed = auditQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return validationFailure(parsed.error);

    const entries = await getStore().listAudit(parsed.data.limit ?? 100);
    return ok({ entries });
  });
}
