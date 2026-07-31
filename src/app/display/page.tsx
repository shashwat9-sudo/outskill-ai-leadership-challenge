import type { Metadata } from 'next';
import { DisplayScenes } from '@/components/display/display-scenes';
import { getStore } from '@/lib/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'TV Display' };

/**
 * The TV / LED screen route.
 *
 * Deliberately carries no QR code: participation happens on the five booth tablets, not by scanning
 * from across the hall. The three rotating scenes are the top five, the event pulse and an Outskill
 * brand message. No login, and nothing on screen is personal data.
 */
export default async function DisplayPage() {
  const settings = await getStore().getSettings();

  return (
    <DisplayScenes
      eventName={settings.event_name}
      quizTitle={settings.quiz_title}
      supportingLine={settings.supporting_line}
      leaderboardSize={settings.leaderboard_size}
    />
  );
}
