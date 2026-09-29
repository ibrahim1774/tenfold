// Pure mapping from Superwall's subscription state to a Tenfold plan (tier + billing period). No expo-superwall
// import here, so tests (and code that runs without the native module) can use it. superwallLive.tsx only
// feeds these functions and stores what they return.
import { PRODUCT_IDS, tierRank, type Billing, type PaidTier, type Tier } from '../onboarding/plans';
import type { OnboardingAnswers } from '../state/onboarding';

/**
 * Superwall entitlement ids, highest first. They match the dashboard (project 42176, app 56647):
 * `starter` ← starter.monthly/yearly, `pro` ← pro.monthly/yearly, `studio` ← studio.monthly/yearly.
 */
export const ENTITLEMENT_TIERS: readonly { id: string; tier: PaidTier }[] = [
  { id: 'studio', tier: 'studio' },
  { id: 'pro', tier: 'pro' },
  { id: 'starter', tier: 'starter' },
];

/** The tier one entitlement id grants. Exact id, ignoring case and surrounding spaces ("Pro" = "pro"). */
export function entitlementTier(id: string): PaidTier | null {
  const key = id.trim().toLowerCase();
  return ENTITLEMENT_TIERS.find((e) => e.id === key)?.tier ?? null;
}

const highest = (tiers: readonly (Tier | null)[]): Tier =>
  tiers.reduce<Tier>((best, t) => (t && tierRank(t) > tierRank(best) ? t : best), 'free');

/** The highest tier among active entitlement ids: studio > pro > starter > free. */
export function tierFromEntitlements(ids: readonly string[]): Tier {
  return highest(ids.map(entitlementTier));
}

/** The tier and billing period an App Store product id is for, or null for an unknown product. */
export function productPlan(productId: string): { tier: PaidTier; billing: Billing } | null {
  for (const [tier, ids] of Object.entries(PRODUCT_IDS) as [PaidTier, Record<Billing, string>][]) {
    if (ids.monthly === productId) return { tier, billing: 'monthly' };
    if (ids.annual === productId) return { tier, billing: 'annual' };
  }
  return null;
}

/** The highest tier among product ids. */
export function tierFromProductIds(ids: readonly string[]): Tier {
  return highest(ids.map((id) => productPlan(id)?.tier ?? null));
}

/** The shape of Superwall's `subscriptionStatus` (useUser), kept local so this file needs no SDK types. */
export type StatusLike =
  | { status: 'UNKNOWN' }
  | { status: 'INACTIVE' }
  | { status: 'ACTIVE'; entitlements?: readonly { id: string }[] };

/** The part of Superwall's `CustomerInfo` read here: the App Store subscriptions and whether each is active. */
export type CustomerInfoLike = {
  subscriptions?: readonly { productId: string; isActive: boolean; isRevoked?: boolean; purchaseDate?: string }[];
} | null;

export type PlanState = { tier: Tier; billing: Billing | null };

/** Active, unrevoked subscriptions, newest purchase first. */
function activeSubscriptions(info: CustomerInfoLike | undefined) {
  return (info?.subscriptions ?? [])
    .filter((s) => s.isActive && !s.isRevoked)
    .slice()
    .sort((a, b) => Date.parse(b.purchaseDate ?? '') - Date.parse(a.purchaseDate ?? '') || 0);
}

/** Product ids of the active subscriptions. */
export function activeProductIds(info: CustomerInfoLike | undefined): string[] {
  return activeSubscriptions(info).map((s) => s.productId);
}

/** The billing period of the newest active subscription for `tier`, or null when none is known. */
export function billingFor(tier: Tier, info: CustomerInfoLike | undefined): Billing | null {
  if (tier === 'free') return null;
  for (const s of activeSubscriptions(info)) {
    const p = productPlan(s.productId);
    if (p?.tier === tier) return p.billing;
  }
  return null;
}

/**
 * The plan to use given Superwall's status and customer info.
 * - No status or `UNKNOWN` (Superwall unavailable: old build, not configured, offline on first launch): the last known plan.
 * - `INACTIVE` (never subscribed, expired, refunded): Free.
 * - `ACTIVE`: the entitlements decide. If none of them is a Tenfold entitlement (renamed in the dashboard,
 *   or a product without one), the active App Store product ids decide instead.
 */
export function planFromStatus(status: StatusLike | null | undefined, info: CustomerInfoLike | undefined, last: PlanState): PlanState {
  if (!status || status.status === 'UNKNOWN') return last;
  if (status.status === 'INACTIVE') return { tier: 'free', billing: null };
  let tier = tierFromEntitlements((status.entitlements ?? []).map((e) => e.id));
  if (tier === 'free') tier = tierFromProductIds(activeProductIds(info));
  if (tier === 'free') return { tier, billing: null };
  return { tier, billing: billingFor(tier, info) ?? (tier === last.tier ? last.billing : null) };
}

/** The tier alone; see `planFromStatus`. */
export function tierFromStatus(status: StatusLike | null | undefined, lastKnown: Tier, info?: CustomerInfoLike): Tier {
  return planFromStatus(status, info, { tier: lastKnown, billing: null }).tier;
}

/**
 * Right after a purchase or restore, before Superwall's status event lands: the plan the fresh entitlements
 * (or, failing those, the active products and the product just bought) grant, when it is higher than the
 * current one or the same tier on a new billing period. Null = leave the plan alone. Never lowers the tier:
 * the status listener does that, so a slow or failed refresh can't take a paid plan away.
 */
export function raisedPlan(
  current: PlanState,
  fresh: { entitlementIds: readonly string[]; info?: CustomerInfoLike; purchasedProductId?: string },
): PlanState | null {
  let tier = tierFromEntitlements(fresh.entitlementIds);
  const products = [...activeProductIds(fresh.info), ...(fresh.purchasedProductId ? [fresh.purchasedProductId] : [])];
  if (tier === 'free') tier = tierFromProductIds(products);
  if (tierRank(tier) < tierRank(current.tier) || tier === 'free') return null;
  const bought = fresh.purchasedProductId ? productPlan(fresh.purchasedProductId) : null;
  const billing = (bought?.tier === tier ? bought.billing : null) ?? billingFor(tier, fresh.info) ?? (tier === current.tier ? current.billing : null);
  if (tier === current.tier && billing === current.billing) return null;
  return { tier, billing };
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
