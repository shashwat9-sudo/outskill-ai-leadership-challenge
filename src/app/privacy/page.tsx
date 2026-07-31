import type { Metadata } from 'next';
import { PageFrame } from '@/components/ui/page-frame';
import { Eyebrow } from '@/components/ui/primitives';
import { getStore } from '@/lib/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Privacy notice' };

/**
 * The privacy notice.
 *
 * The body text is editable in admin settings so the event owner can adjust wording without a
 * deployment. The list below it is fixed, because it states what the software actually does.
 */
export default async function PrivacyPage() {
  const settings = await getStore().getSettings();
  const paragraphs = settings.privacy_notice_text.split('\n').filter((line) => line.trim().length > 0);

  return (
    <PageFrame eventName={settings.event_name} eventLocation={settings.event_location}>
      <article className="mx-auto w-full max-w-2xl px-5 pb-16 pt-4 sm:px-8 sm:pt-8">
        <Eyebrow>Participation</Eyebrow>
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Privacy notice</h1>

        <div className="mt-8 space-y-4">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="leading-relaxed text-[var(--color-ink-muted)]">
              {paragraph}
            </p>
          ))}
        </div>

        <h2 className="mt-12 text-xl font-semibold">What we collect</h2>
        <ul className="mt-4 space-y-2.5 text-[var(--color-ink-muted)]">
          <li className="flex gap-3">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
            Your full name, email address and phone number.
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
            Your answers, your score and how long you took.
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
            Whether you ticked the leaderboard and follow-up boxes.
          </li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">What we do not collect</h2>
        <p className="mt-4 leading-relaxed text-[var(--color-ink-muted)]">
          We do not ask for your company, job title, designation, address or a password. We do not store
          your IP address — only a one-way scrambled version of it, used to spot automated abuse.
        </p>

        <h2 className="mt-10 text-xl font-semibold">How it is used</h2>
        <p className="mt-4 leading-relaxed text-[var(--color-ink-muted)]">
          To operate the challenge, place you on the leaderboard, verify entries in person and administer
          the prizes. Giving us your email address does not sign you up for anything on its own: follow-up
          resources require the separate, optional consent box. If you did not tick it, we will not.
        </p>

        <h2 className="mt-10 text-xl font-semibold">We do not email your result</h2>
        <p className="mt-4 leading-relaxed text-[var(--color-ink-muted)]">
          There is no result email. Your score and a review of all seven of your answers appear on the
          tablet immediately after you submit, and only there. The tablet clears itself for the next
          participant shortly afterwards, so please read the review before you hand it back.
        </p>

        <h2 className="mt-10 text-xl font-semibold">How long we keep it</h2>
        <p className="mt-4 leading-relaxed text-[var(--color-ink-muted)]">
          Your details are retained for seven days after the event. After that, and once the Outskill team
          has completed the lead export, the records are anonymised by an administrator.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What appears in public</h2>
        <p className="mt-4 leading-relaxed text-[var(--color-ink-muted)]">
          Only if you ticked the leaderboard box: your first name and the initial of your surname, for
          example &ldquo;Ananya S.&rdquo;. Otherwise you appear as &ldquo;Anonymous Leader&rdquo; with a
          number. Your email address and phone number are never shown publicly, on any screen.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Contacting us about your data</h2>
        <p className="mt-4 leading-relaxed text-[var(--color-ink-muted)]">{settings.privacy_contact_text}</p>

        <p className="mt-12 text-xs text-[var(--color-ink-faint)]">
          Last updated {new Date(settings.updated_at).toISOString().slice(0, 10)}.
        </p>
      </article>
    </PageFrame>
  );
}
