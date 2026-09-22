'use client';

import { usePathname } from 'next/navigation';
import { AnchorAd, LeaderboardAd } from './AdPlaceholder';

const adFreePaths = new Set(['/about', '/contact', '/privacy', '/terms']);

function shouldHideAds(pathname: string) {
  return adFreePaths.has(pathname);
}

export function TopLeaderboardChrome() {
  const pathname = usePathname();
  if (shouldHideAds(pathname)) return null;
  return <LeaderboardAd />;
}

export function AnchorAdChrome() {
  const pathname = usePathname();
  if (shouldHideAds(pathname)) return null;
  return <AnchorAd />;
}
