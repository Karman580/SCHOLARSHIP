import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Sans_Devanagari, IBM_Plex_Mono } from 'next/font/google';
import { DisclosureStrip, FallbackBanner } from '@/components/Chrome';
import { AI_ENABLED } from '@/lib/ai/client';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600'], display: 'swap', variable: '--font-bricolage' });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '600'], display: 'swap', variable: '--font-plex' });
// Plex has a matched Devanagari family, so Hindi output never falls back to a
// different-looking face mid-sentence.
const devanagari = IBM_Plex_Sans_Devanagari({ subsets: ['devanagari'], weight: ['400', '600'], display: 'swap', variable: '--font-plex-deva' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], display: 'swap', variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: 'Scholarship Saathi — find out where your scholarship payment is stuck',
  description:
    'Your scholarship says approved and the money has not come. Find out which step is actually stuck, and what to do about it. An independent prototype using synthetic data.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${devanagari.variable} ${mono.variable}`}>
      <body>
        <DisclosureStrip />
        {AI_ENABLED() ? null : <FallbackBanner />}
        {children}
      </body>
    </html>
  );
}
