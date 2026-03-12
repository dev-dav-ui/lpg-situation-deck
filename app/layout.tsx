import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://lpg-situation-deck.vercel.app'),
  title: 'LPG Situation Deck — Real-time India Shortage Tracker',
  description: 'Track LPG wait times, prices, and shortages across India. Live updates every 6 hours from IOCL data and crowdsourced reports.',
  keywords: 'LPG shortage India, LPG price, cooking gas shortage, IOCL, Indane, LPG cylinder wait time',
  openGraph: {
    title: 'LPG Situation Deck — Real-time India Shortage Tracker',
    description: 'Track LPG wait times, prices, and shortages across 30+ Indian cities. Live data.',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'LPG Situation Deck Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LPG Situation Deck — Real-time India Shortage Tracker',
    description: 'Track LPG wait times, prices, and shortages across India.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
