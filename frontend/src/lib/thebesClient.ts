const THEBES_SITE_KEY = 'jobsthe.world';
const THEBES_PILOT_ORIGIN = 'https://thebes-sdk-pilot.adesh-4df.workers.dev';

type ThebesBannerPlacementKey = 'native' | 'anchor';
type ThebesOutOfPagePlacementKey = 'interstitial' | 'rewarded';
type ThebesSize = [number, number];

interface ThebesBannerResult {
  ok: boolean;
  noFill: boolean;
  requestId: string;
  placementKey: string;
  reason?: string;
}

interface ThebesRewardedCallbacks {
  onRewarded?: (payload?: unknown) => void;
  onClosed?: (event?: unknown) => void;
  onError?: (error: Error) => void;
}

interface ThebesApi {
  init(options: { siteKey: string; endpoint?: string; domain?: string }): Promise<unknown>;
  showBanner(options: {
    placementKey: ThebesBannerPlacementKey;
    element: HTMLElement;
    size: ThebesSize;
  }): Promise<ThebesBannerResult>;
  showInterstitial(options: { placementKey: ThebesOutOfPagePlacementKey }): Promise<ThebesBannerResult>;
  showRewarded(options: ThebesRewardedCallbacks & { placementKey: ThebesOutOfPagePlacementKey }): Promise<ThebesBannerResult>;
}

declare global {
  interface Window {
    Thebes?: ThebesApi;
    __jobGuideThebesInitPromise?: Promise<ThebesApi>;
    __jobGuideRewardedReadyInstalled?: boolean;
    googletag?: {
      cmd?: Array<() => void>;
      pubads?: () => {
        addEventListener?: (eventName: string, callback: (event: { makeRewardedVisible?: () => boolean }) => void) => void;
      };
    };
  }
}

function waitForThebes(timeoutMs = 8000): Promise<ThebesApi> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function check() {
      if (window.Thebes) {
        resolve(window.Thebes);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('Thebes SDK did not load before timeout.'));
        return;
      }

      window.setTimeout(check, 50);
    }

    check();
  });
}

export function thebesSlotSize(element: HTMLElement): ThebesSize {
  const rect = element.getBoundingClientRect();
  return [
    Math.max(1, Math.round(rect.width)),
    Math.max(1, Math.round(rect.height))
  ];
}

export async function waitForRenderedSlotSize(element: HTMLElement): Promise<ThebesSize> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return thebesSlotSize(element);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  return thebesSlotSize(element);
}

export async function initializeThebes(): Promise<ThebesApi> {
  if (typeof window === 'undefined') throw new Error('Thebes SDK can only initialize in the browser.');

  if (!window.__jobGuideThebesInitPromise) {
    window.__jobGuideThebesInitPromise = waitForThebes()
      .then(async (thebes) => {
        await thebes.init({
          siteKey: THEBES_SITE_KEY,
          endpoint: THEBES_PILOT_ORIGIN
        });
        return thebes;
      })
      .catch((error) => {
        window.__jobGuideThebesInitPromise = undefined;
        throw error;
      });
  }

  return window.__jobGuideThebesInitPromise;
}

export async function showThebesBanner(
  placementKey: ThebesBannerPlacementKey,
  element: HTMLElement,
  size: ThebesSize
) {
  const thebes = await initializeThebes();
  return thebes.showBanner({ placementKey, element, size });
}

export async function showThebesInterstitial() {
  const thebes = await initializeThebes();
  return thebes.showInterstitial({ placementKey: 'interstitial' });
}

function installRewardedReadyHandler() {
  if (window.__jobGuideRewardedReadyInstalled) return;
  window.__jobGuideRewardedReadyInstalled = true;

  window.googletag?.cmd?.push(() => {
    window.googletag?.pubads?.().addEventListener?.('rewardedSlotReady', (event) => {
      event.makeRewardedVisible?.();
    });
  });
}

export async function showThebesRewarded(callbacks: ThebesRewardedCallbacks) {
  const thebes = await initializeThebes();
  installRewardedReadyHandler();
  return thebes.showRewarded({
    placementKey: 'rewarded',
    ...callbacks
  });
}
