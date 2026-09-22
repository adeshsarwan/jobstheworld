import type { Metadata } from 'next';
import Script from 'next/script';
import { AnchorAdChrome, TopLeaderboardChrome } from '../components/AdChrome';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://jobsthe.world'),
  title: 'Job Guide Match',
  description: 'A simple guided job search experience.',
  openGraph: {
    title: 'Job Guide Match',
    description: 'Find practical work that fits your life.',
    url: 'https://jobsthe.world',
    siteName: 'Job Guide Match',
    type: 'website'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Header />
        <TopLeaderboardChrome />
        {children}
        <Footer />
        <AnchorAdChrome />
        <Script
          id="thebes-pilot-sdk"
          src="https://thebes-sdk-pilot.adesh-4df.workers.dev/sdk.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
