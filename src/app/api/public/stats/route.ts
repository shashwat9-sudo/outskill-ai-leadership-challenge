import { guarded, ok, NO_STORE_HEADERS } from '@/lib/api/respond';
import { PILLAR_LABELS } from '@/lib/config/constants';
import { getStore } from '@/lib/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Aggregate event numbers for the landing page, the leaderboard header and the LED display. */
export async function GET() {
  return guarded('public.stats', async () => {
    const store = getStore();
    const [settings, stats] = await Promise.all([store.getSettings(), store.getStats()]);

    return ok(
      {
        total_challengers: stats.total_challengers,
        total_completed: stats.total_completed,
        average_score: stats.average_score,
        best_score: stats.best_score,
        fastest_perfect_ms: stats.fastest_perfect_ms,
        toughest_pillar: stats.toughest_pillar,
        toughest_pillar_label: stats.toughest_pillar ? PILLAR_LABELS[stats.toughest_pillar] : null,
        toughest_pillar_accuracy: stats.toughest_pillar_accuracy,
        questions_per_attempt: settings.questions_per_attempt,
        quiz_state: settings.quiz_state,
        prize_first: settings.prize_first,
        winner_announcement_at: settings.winner_announcement_at,
      },
      { headers: NO_STORE_HEADERS },
    );
  });
}
