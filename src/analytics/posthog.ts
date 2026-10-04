// Product analytics through PostHog: which onboarding steps people finish, where the paywall shows and
// converts, and whether people get from importing clips to exporting them.
//
// Privacy: only explicit events below and screen names. No session replay, no touch autocapture, and never
// video, transcripts, caption text, file names or paths. People are anonymous (the app has no accounts).
//
// The project token comes from EXPO_PUBLIC_POSTHOG_KEY in .env.local. Without it (tests, or a build made
// without it) every function here does nothing. The SDK is required lazily so Node tests never load it.

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const HOST = 'https://us.i.posthog.com';

/** Every event name the app sends. The PostHog dashboards are built from this list. */
export const EV = {
  onboardingStep: 'onboarding_step_viewed',
  onboardingAnswered: 'onboarding_answered',
  onboardingCompleted: 'onboarding_completed',
  trackingAnswered: 'tracking_prompt_answered',
  paywallRequested: 'paywall_requested',
  paywallShown: 'paywall_shown',
  paywallDismissed: 'paywall_dismissed',
  trialStarted: 'trial_started',
  subscribed: 'subscribed',
  limitHit: 'limit_hit',
  clipsImported: 'clips_imported',
  generateTapped: 'generate_tapped',
  clipProcessed: 'clip_processed',
  clipFailed: 'clip_failed',
  exportCompleted: 'export_completed',
  exportFailed: 'export_failed',
} as const;

export type EventName = (typeof EV)[keyof typeof EV];
type Props = Record<string, string | number | boolean | null | undefined>;

type Client = {
  capture(event: string, properties?: Props): void;
  screen(name: string, properties?: Props): Promise<void> | void;
  register(properties: Props): Promise<void> | void;
  setPersonProperties?(set: Props, setOnce?: Props): void;
  identify(distinctId?: string, properties?: Props): void;
  getDistinctId(): string;
  flush(): Promise<void> | void;
};

let client: Client | null | undefined;

function ph(): Client | null {
  if (client !== undefined) return client;
  client = null;
  if (!KEY) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PostHog } = require('posthog-react-native');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Storage = require('expo-sqlite/kv-store').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default;
    client = new PostHog(KEY, {
      host: HOST,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      // The app's own SQLite key-value store, so PostHog needs no extra native modules.
      customStorage: {
        getItem: (k: string) => Storage.getItemSync(`posthog:${k}`),
        setItem: (k: string, v: string) => Storage.setItemSync(`posthog:${k}`, v),
      },
      customAppProperties: (p: Record<string, unknown>) => ({
        ...p,
        $app_version: Constants.expoConfig?.version ?? null,
      }),
    }) as Client;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require('expo-device');
    // Dashboards count `prod` only: development builds and the simulator are kept apart.
    client.register({ env: __DEV__ ? 'dev' : Device.isDevice ? 'prod' : 'simulator' });
  } catch {
    client = null;
  }
  return client;
}

/** An error message safe to send: file paths removed, kept short. */
export function errorReason(message: string): string {
  return message.replace(/(file:\/\/)?\/[^\s'"]+/g, '<path>').slice(0, 120);
}

/** Starts PostHog early (app launch); later calls reuse the same client. */
export function startAnalytics() {
  ph();
}

export function track(event: EventName, properties?: Props) {
  try {
    ph()?.capture(event, properties);
  } catch {
    // Analytics never breaks the app.
  }
}

/** A screen view, by route pattern (`batch/[batchId]`), never a path with ids in it. */
export function trackScreen(name: string) {
  try {
    ph()?.screen(name);
  } catch {
    // Best effort.
  }
}

/** Facts about this person, kept on their PostHog profile and sent with every later event when `everyEvent`. */
export function setTraits(traits: Props, everyEvent = false) {
  const c = ph();
  if (!c) return;
  try {
    if (c.setPersonProperties) c.setPersonProperties(traits);
    else c.identify(c.getDistinctId(), { $set: traits } as unknown as Props);
    if (everyEvent) c.register(traits);
  } catch {
    // Best effort.
  }
}
