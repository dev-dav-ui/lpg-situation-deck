import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://lpg-situation-deck.vercel.app'),
  title: 'India LPG Supply Signal Monitor',
  description: 'AI-based monitoring of LPG delivery disruption signals across Indian cities using public data, distributor activity and news events.',
  keywords: 'LPG supply signals India, LPG delivery disruption, cooking gas monitor, IOCL, Indane, LPG cylinder signal',
  openGraph: {
    title: 'India LPG Supply Signal Monitor',
    description: 'AI-based monitoring of LPG delivery disruption signals across Indian cities using public data, distributor activity and news events.',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'India LPG Supply Signal Monitor Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'India LPG Supply Signal Monitor',
    description: 'AI-based monitoring of LPG delivery disruption signals across Indian cities.',
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
