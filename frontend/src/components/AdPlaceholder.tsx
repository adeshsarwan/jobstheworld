'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { showThebesBanner, waitForRenderedSlotSize } from '../lib/thebesClient';

type AdPlacement = 'leaderboard' | 'anchor' | 'sidebar' | 'rectangle' | 'interstitial' | 'native';
type BannerPlacementKey = 'native' | 'anchor';

type LoadState = 'idle' | 'loading' | 'requested' | 'error';

const placementMeta: Record<AdPlacement, { label: string; size: string }> = {
  leaderboard: { label: 'Advertisement', size: '970 x 90 desktop / 320 x 50 mobile' },
  anchor: { label: 'Advertisement', size: 'Anchor 970 x 90 / 320 x 50' },
  sidebar: { label: 'Advertisement', size: '300 x 250' },
  rectangle: { label: 'Advertisement', size: '300 x 250' },
  interstitial: { label: 'Advertisement', size: 'Interstitial placeholder' },
  native: { label: 'Advertisement', size: 'Native banner placeholder' }
};

const thebesPlacementKey: Record<AdPlacement, BannerPlacementKey | null> = {
  leaderboard: 'native',
  anchor: 'anchor',
  sidebar: 'native',
  rectangle: 'native',
  interstitial: null,
  native: 'native'
};

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function AdPlaceholder({ placement = 'sidebar' }: { placement?: AdPlacement }) {
  const meta = placementMeta[placement];
  const pathname = usePathname();
  const reactId = useId();
  const frameRef = useRef<HTMLElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [measuredSize, setMeasuredSize] = useState<[number, number] | null>(null);
  const placementKey = thebesPlacementKey[placement];
  const targetId = useMemo(() => `thebes-${placement}-${safeId(reactId)}`, [placement, reactId]);

  useEffect(() => {
    if (!placementKey) return;
    const resolvedPlacementKey = placementKey;

    let cancelled = false;
    let requested = false;
    let observer: IntersectionObserver | null = null;

    async function requestAd() {
      if (requested) return;
      requested = true;

      const frame = frameRef.current;
      const target = targetRef.current;
      if (!frame || !target) return;

      setLoadState('loading');
      const size = await waitForRenderedSlotSize(frame);
      if (cancelled) return;

      target.style.width = `${size[0]}px`;
      target.style.height = `${size[1]}px`;
      setMeasuredSize(size);

      const result = await showThebesBanner(resolvedPlacementKey, target, size);
      if (cancelled) return;

      setLoadState(result.ok ? 'requested' : 'error');
      if (!result.ok) {
        console.warn('Thebes banner returned no fill', {
          placementKey,
          reason: result.reason,
          requestId: result.requestId
        });
      }
    }

    function startRequest() {
      requestAd().catch((error) => {
        if (cancelled) return;
        setLoadState('error');
        console.warn('Thebes banner failed', error);
      });
    }

    const frame = frameRef.current;

    if (frame && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        const shouldRequest = entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0);
        if (!shouldRequest) return;

        observer?.disconnect();
        observer = null;
        startRequest();
      }, {
        rootMargin: '1200px 0px',
        threshold: 0
      });

      observer.observe(frame);
    } else {
      startRequest();
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [placementKey, pathname]);

  return (
    <aside
      ref={frameRef}
      className={`ad-placeholder ad-placeholder-${placement} ad-placeholder-${loadState}`}
      aria-label={meta.label}
      data-thebes-placement={placementKey || undefined}
      data-thebes-size={measuredSize ? `${measuredSize[0]}x${measuredSize[1]}` : undefined}
    >
      {placementKey ? <div id={targetId} ref={targetRef} className="thebes-ad-target" /> : null}
      {loadState !== 'requested' ? (
        <div className="ad-placeholder-fallback">
          <span>{loadState === 'error' ? 'Advertisement unavailable' : meta.label}</span>
          <small>{measuredSize ? `${measuredSize[0]} x ${measuredSize[1]}` : meta.size}</small>
        </div>
      ) : null}
    </aside>
  );
}

export function LeaderboardAd() {
  return (
    <div className="top-ad-region">
      <AdPlaceholder placement="leaderboard" />
    </div>
  );
}

export function AnchorAd() {
  return <AdPlaceholder placement="anchor" />;
}

export function RectangleAd() {
  return <AdPlaceholder placement="rectangle" />;
}
