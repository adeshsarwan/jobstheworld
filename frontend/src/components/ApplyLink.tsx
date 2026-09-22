'use client';

import type { MouseEvent, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function ApplyLink({
  applyUrl,
  children = 'Official apply link'
}: {
  applyUrl: string;
  children?: ReactNode;
}) {
  function openApplyUrl(event: MouseEvent<HTMLAnchorElement>) {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    const openedWindow = window.open(applyUrl, '_blank', 'noopener,noreferrer');
    if (openedWindow) openedWindow.opener = null;
  }

  return (
    <a
      className="primary-button icon-button"
      href={applyUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-google-interstitial="false"
      onClick={openApplyUrl}
    >
      {children}
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>
  );
}
