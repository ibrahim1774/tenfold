// Pure mapping from Superwall's subscription state to a Tenfold tier. No expo-superwall import here,
// so tests (and code that runs without the native module) can use it.
import type { Tier } from '../onboarding/plans';
import type { OnboardingAnswers } from '../state/onboarding';

/** Superwall entitlement ids, highest first. */
export const ENTITLEMENT_TIERS: readonly { id: string; tier: Tier }[] = [
  { id: 'studio', tier: 'studio' },
  { id: 'pro', tier: 'pro' },
  { id: 'starter', tier: 'starter' },
];

/** The highest tier among active entitlement ids: studio > pro > starter > free. */
export function tierFromEntitlements(ids: readonly string[]): Tier {
  return ENTITLEMENT_TIERS.find((e) => ids.includes(e.id))?.tier ?? 'free';
}

/** The shape of Superwall's `subscriptionStatus` (useUser), kept local so this file needs no SDK types. */
export type StatusLike =
  | { status: 'UNKNOWN' }
  | { status: 'INACTIVE' }
  | { status: 'ACTIVE'; entitlements?: readonly { id: string }[] };

/**
 * The tier to use given Superwall's status. `UNKNOWN`, or no status at all (Superwall unavailable:
 * old build without the module, not configured, offline on first launch), keeps the last known tier.
 */
export function tierFromStatus(status: StatusLike | null | undefined, lastKnown: Tier): Tier {
  if (!status || status.status === 'UNKNOWN') return lastKnown;
  if (status.status === 'INACTIVE') return 'free';
  return tierFromEntitlements((status.entitlements ?? []).map((e) => e.id));
}

/** Superwall user attributes from the onboarding answers. Answers only; nothing personal. */
export function onboardingAttributes(answers: OnboardingAnswers, language: string | null): Record<string, string | null> {
  return {
    role: answers.role,
    videosPerWeek: answers.videosPerWeek,
    minutesPerVideo: answers.minutesPerVideo,
    language,
  };
}
