import type { NextRequest } from 'next/server';
import { guarded, ok, validationFailure, NO_STORE_HEADERS } from '@/lib/api/respond';
import { getStore } from '@/lib/database';
import { toPublicEntry } from '@/lib/quiz/ranking';
import { leaderboardQuerySchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The public leaderboard.
 *
 * Every row is passed through `toPublicEntry`, which drops the full name, email, phone, consent flags
 * and database ids. Nothing in this response can identify a participant beyond the name they
 * explicitly opted to display.
 */
export async function GET(request: NextRequest) {
  return guarded('public.leaderboard', async () => {
    const parsed = leaderboardQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return validationFailure(parsed.error);

    const store = getStore();
    const settings = await store.getSettings();
    const limit = parsed.data.limit ?? settings.leaderboard_size;

    const rows = await store.getLeaderboard(limit);

    return ok(
      {
        entries: rows.map((row) => toPublicEntry(row, settings.questions_per_attempt)),
        leaderboard_size: settings.leaderboard_size,
        questions_per_attempt: settings.questions_per_attempt,
        refresh_seconds: settings.leaderboard_refresh_seconds,
        winner_announcement_at: settings.winner_announcement_at,
        quiz_state: settings.quiz_state,
      },
      { headers: NO_STORE_HEADERS },
    );
  });
}
