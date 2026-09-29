import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { TopBar } from '@/components/TopBar';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['SOFT', 'WONK', 'opsz'],
  display: 'swap',
});

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Tuindirigent — tuinontwerpen van Nederlandse ontwerpers',
  description:
    'Marktplaats voor tuinontwerpen, met uitbetaling aan ontwerpers via Stripe Connect en zelffacturering.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <TopBar />
        {children}
      </body>
    </html>
  );
}
