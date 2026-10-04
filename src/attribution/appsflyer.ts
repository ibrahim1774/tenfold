// Install and purchase attribution for ads on Meta, TikTok and Google, through AppsFlyer.
//
// Order matters (react-native-appsflyer 7.x): Apple's tracking prompt is answered first, then init(),
// then listeners, then start() inside the session-ready callback. Nothing here touches videos: AppsFlyer
// only learns about installs, opens, trials and subscriptions.
//
// The dev key comes from EXPO_PUBLIC_APPSFLYER_DEV_KEY in .env.local (gitignored; the repo is public).
// Without it, or in a build without the native module, every function here does nothing.

import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { TurboModuleRegistry } from 'react-native';

import { EV, setTraits, track } from '@/analytics/posthog';

export const APPSFLYER_APP_ID = '6816729918';
const DEV_KEY = process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY ?? '';

/** The part of react-native-appsflyer 7.x this app uses (its own types ship as raw .ts that don't typecheck here). */
type AF = {
  init(p: { devKey: string; appId: string }): Promise<unknown>;
  registerSessionReadyListener(cb: () => void): unknown;
  start(): Promise<unknown>;
  getAppsFlyerUID(): Promise<string | null>;
  setCustomerUserId(p: { customerId: string }): Promise<unknown>;
  logEvent(p: { eventName: string; eventValues?: Record<string, string | number> }): Promise<unknown>;
};

let started: Promise<string | null> | null = null;

function sdk(): AF | null {
  if (!DEV_KEY) return null;
  // The package calls TurboModuleRegistry.getEnforcing('RNAppsFlyer') at import, which throws in a build
  // without the pod, so check first.
  if (!TurboModuleRegistry.get('RNAppsFlyer')) return null;
  try {
    // Loaded lazily on purpose: importing it without the native module throws at launch.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-appsflyer').default as AF;
  } catch {
    return null;
  }
}

/** True once the person has answered Apple's tracking prompt (either way), so starting won't prompt. */
export async function trackingAnswered(): Promise<boolean> {
  try {
    const p = await getTrackingPermissionsAsync();
    return p.status !== 'undetermined';
  } catch {
    return true;
  }
}

/**
 * Shows Apple's "Allow Tenfold to track…" prompt if it hasn't been answered, then starts AppsFlyer.
 * Safe to call more than once; resolves to the AppsFlyer id, or null when attribution is off.
 */
export function startAttribution(): Promise<string | null> {
  if (started) return started;
  started = (async () => {
    const af = sdk();
    if (!af) return null;
    try {
      if (!(await trackingAnswered())) {
        const { status } = await requestTrackingPermissionsAsync();
        track(EV.trackingAnswered, { status });
        setTraits({ tracking: status });
      }
    } catch {
      // No prompt available: AppsFlyer still attributes through Apple's privacy-preserving reports.
    }
    try {
      await af.init({ devKey: DEV_KEY, appId: APPSFLYER_APP_ID });
      const ready = new Promise<void>((resolve) => {
        af.registerSessionReadyListener(() => {
          af.start().then(
            () => resolve(),
            () => resolve(),
          );
        });
      });
      await ready;
      return (await af.getAppsFlyerUID()) ?? null;
    } catch {
      started = null; // try again next launch
      return null;
    }
  })();
  return started;
}

/** Links AppsFlyer's records to the anonymous Superwall user (the app has no accounts). */
export async function setAttributionUser(customerId: string) {
  const af = sdk();
  if (!af || !customerId || !started) return;
  try {
    await started;
    await af.setCustomerUserId({ customerId });
  } catch {
    // Attribution is best effort; the app never waits on it.
  }
}

/** Logs an in-app event (standard AppsFlyer names where one exists, so ad networks map them). */
export async function logAttributionEvent(eventName: string, eventValues?: Record<string, string | number>) {
  const af = sdk();
  if (!af || !started) return;
  try {
    await started;
    await af.logEvent({ eventName, eventValues });
  } catch {
    // Best effort.
  }
}
