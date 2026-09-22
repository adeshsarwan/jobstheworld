'use client';

import { useRef, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { ApplyLink } from './ApplyLink';
import { showThebesRewarded } from '../lib/thebesClient';

export function RewardedApplyGate({ applyUrl }: { applyUrl: string }) {
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const fallbackTimerRef = useRef<number | null>(null);

  function clearFallbackTimer() {
    if (fallbackTimerRef.current === null) return;
    window.clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
  }

  function requestRewardedAd() {
    clearFallbackTimer();
    setStatus('loading');

    fallbackTimerRef.current = window.setTimeout(() => {
      setRevealed(true);
      setStatus('error');
      fallbackTimerRef.current = null;
    }, 12000);

    showThebesRewarded({
      onRewarded: () => {
        clearFallbackTimer();
        setRevealed(true);
        setStatus('idle');
      },
      onClosed: () => {
        clearFallbackTimer();
        setRevealed(true);
        setStatus('idle');
      },
      onError: (error) => {
        clearFallbackTimer();
        setRevealed(true);
        setStatus('error');
        console.warn('Thebes rewarded ad failed', error);
      }
    }).then((result) => {
      if (!result.ok) {
        clearFallbackTimer();
        setRevealed(true);
        setStatus('error');
        console.warn('Thebes rewarded returned no fill', result);
      }
    }).catch((error) => {
      clearFallbackTimer();
      setRevealed(true);
      setStatus('error');
      console.warn('Thebes rewarded request failed', error);
    });
  }

  return (
    <section className="rewarded-gate" aria-label="Official apply link gate">
      <div className="rewarded-gate-actions">
        {revealed ? (
          <ApplyLink applyUrl={applyUrl} />
        ) : (
          <button className="primary-button icon-button" type="button" onClick={requestRewardedAd} disabled={status === 'loading'}>
            <PlayCircle size={18} aria-hidden="true" />
            View ad to reveal apply link
          </button>
        )}
      </div>
    </section>
  );
}
