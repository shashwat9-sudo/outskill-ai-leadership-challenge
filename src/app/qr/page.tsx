import type { Metadata } from 'next';
import Link from 'next/link';
import { PrintButton } from '@/components/display/print-button';
import { Wordmark } from '@/components/ui/wordmark';
import { getAppUrl } from '@/lib/config/env';
import { getStore } from '@/lib/database';
import { participantUrl, qrDataUrl, qrSvg } from '@/lib/utils/qr';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'QR poster' };

/**
 * Print-friendly QR poster for the booth.
 *
 * Everything except the sheet itself is hidden when printed (see the `@media print` block in
 * globals.css), so a booth laptop can hit Cmd+P and get a clean A4 page with no dark background.
 */
export default async function QrPosterPage() {
  const settings = await getStore().getSettings();
  const url = participantUrl(getAppUrl());
  const [svg, dataUrl] = await Promise.all([qrSvg(url, 900), qrDataUrl(url, 1024)]);

  return (
    <div className="min-h-dvh px-5 py-8 sm:px-8">
      <div className="print-hide mx-auto mb-8 flex max-w-3xl flex-wrap items-center justify-between gap-4">
        <Link href="/admin/settings" className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          ← Back to settings
        </Link>
        <PrintButton svgMarkup={svg} pngDataUrl={dataUrl} />
      </div>

      <main
        id="main"
        className="print-sheet mx-auto flex max-w-3xl flex-col items-center rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-white px-10 py-14 text-center text-[#070807]"
      >
        <div className="text-[#070807]">
          <span className="text-sm font-semibold uppercase tracking-[0.32em]">Outskill</span>
        </div>

        <h1 className="mt-8 max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {settings.quiz_title}
        </h1>
        <p className="mt-4 max-w-lg text-lg text-[#3d423a]">{settings.supporting_line}</p>

        <div
          className="mt-10 w-[300px] sm:w-[360px]"
          // Server-generated QR SVG encoding our own public URL; no user input reaches this string.
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="mt-8 text-2xl font-semibold">{settings.qr_caption}</p>
        <p className="mt-2 text-base text-[#3d423a]">{url.replace(/^https?:\/\//, '')}</p>

        <p className="mt-10 max-w-md text-sm text-[#5b6156]">
          {settings.prize_first} · Winner announced at the end of Day 2 · {settings.event_name}
        </p>
      </main>

      <p className="print-hide mx-auto mt-6 max-w-3xl text-center text-xs text-[var(--color-ink-faint)]">
        This code opens the participant landing page, never the admin interface. Print at A4 or larger and
        test a scan from about a metre before the doors open.
      </p>

      {/* Hidden wordmark keeps the component in the tree so the official-asset swap is exercised here too. */}
      <div className="sr-only">
        <Wordmark size="sm" />
      </div>
    </div>
  );
}
