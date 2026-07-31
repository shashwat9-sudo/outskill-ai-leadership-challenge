import type { Metadata } from 'next';
import { PageFrame } from '@/components/ui/page-frame';
import { ChallengeExperience } from '@/components/participant/challenge-experience';
import { getStore } from '@/lib/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Take the Challenge' };

/**
 * The challenge route.
 *
 * A server component that reads live event settings and hands them to the client state machine, so
 * an organiser changing the duration or question count in the admin takes effect on the next visitor
 * without a deployment.
 *
 * `?kiosk=1` puts a booth tablet into kiosk mode: no footer chrome, session cleared on arrival, and
 * an idle auto-reset on the result screen.
 */
export default async function ChallengePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kiosk = params.kiosk === '1' || params.kiosk === 'true';

  const settings = await getStore().getSettings();

  return (
    <PageFrame
      eventName={settings.event_name}
      eventLocation={settings.event_location}
      showFooter={!kiosk}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col justify-center px-5 py-6 sm:px-8 sm:py-10">
        <ChallengeExperience
          kiosk={kiosk}
          autoResetSeconds={settings.result_auto_reset_seconds}
          quizState={settings.quiz_state}
          durationSeconds={settings.quiz_duration_seconds}
          questionsPerAttempt={settings.questions_per_attempt}
        />
      </div>
    </PageFrame>
  );
}
