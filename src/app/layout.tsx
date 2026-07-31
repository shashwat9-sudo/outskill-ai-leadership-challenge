import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { DemoModeBadge } from '@/components/ui/demo-mode-badge';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'], display: 'swap' });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'The AI Leadership Challenge — Outskill',
    template: '%s · Outskill',
  },
  description:
    'Can you make the right AI decisions under pressure? 7 leadership decisions. 130 seconds. ' +
    'One live leaderboard. The Outskill challenge at the People Matters TechHR Summit 2026.',
  robots: { index: false, follow: false },
  applicationName: 'Outskill AI Leadership Challenge',
};

export const viewport: Viewport = {
  themeColor: '#070807',
  width: 'device-width',
  initialScale: 1,
  // Booth tablets need pinch-zoom for accessibility; never disable user scaling.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-[var(--color-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--color-canvas)]"
        >
          Skip to main content
        </a>
        <DemoModeBadge />
        {children}
      </body>
    </html>
  );
}
