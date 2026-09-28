// The one source of truth for tiers: names, prices, App Store products and limits.
// `src/state/entitlements.ts` reads its limits from here; the paywall and Settings read the copy.
// Superwall's paywalls show the store's localized prices; these USD prices drive the native fallback paywall.
// No imports from `state/`, so this file stays free of import cycles.

export type Tier = 'free' | 'starter' | 'pro' | 'studio';
export type PaidTier = Exclude<Tier, 'free'>;
export type Billing = 'monthly' | 'annual';

/** Lowest to highest. */
export const TIER_ORDER: readonly Tier[] = ['free', 'starter', 'pro', 'studio'];
export const PAID_TIERS: readonly PaidTier[] = ['starter', 'pro', 'studio'];

export const TRIAL_DAYS = 3;

export type TierLimits = {
  /** Exports a calendar month; Infinity = unlimited. */
  exportsPerMonth: number;
  /** Clips per batch. */
  batchSize: number;
  /** false = only caption styles marked `free`. */
  allCaptionStyles: boolean;
  watermark: boolean;
  /** 4K export. */
  uhd: boolean;
};

export type TierInfo = {
  tier: Tier;
  name: string;
  /** USD; null = free. */
  price: Record<Billing, number> | null;
  limits: TierLimits;
};

export const TIERS: Record<Tier, TierInfo> = {
  free: {
    tier: 'free',
    name: 'Free',
    price: null,
    limits: { exportsPerMonth: 3, batchSize: 10, allCaptionStyles: false, watermark: true, uhd: false },
  },
  starter: {
    tier: 'starter',
    name: 'Starter',
    price: { monthly: 19.99, annual: 159.99 },
    limits: { exportsPerMonth: 100, batchSize: 20, allCaptionStyles: true, watermark: false, uhd: false },
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    price: { monthly: 49.99, annual: 399.99 },
    limits: { exportsPerMonth: 300, batchSize: 50, allCaptionStyles: true, watermark: false, uhd: true },
  },
  studio: {
    tier: 'studio',
    name: 'Studio',
    price: { monthly: 89.99, annual: 719.99 },
    limits: { exportsPerMonth: Infinity, batchSize: 100, allCaptionStyles: true, watermark: false, uhd: true },
  },
};

/** App Store product identifiers (also the Superwall products). */
export const PRODUCT_IDS: Record<PaidTier, Record<Billing, string>> = {
  starter: { monthly: 'com.ibrahim.tenfold.starter.monthly', annual: 'com.ibrahim.tenfold.starter.yearly' },
  pro: { monthly: 'com.ibrahim.tenfold.pro.monthly', annual: 'com.ibrahim.tenfold.pro.yearly' },
  studio: { monthly: 'com.ibrahim.tenfold.studio.monthly', annual: 'com.ibrahim.tenfold.studio.yearly' },
};

export function limitsFor(tier: Tier): TierLimits {
  return TIERS[tier].limits;
}

export function tierRank(tier: Tier): number {
  return TIER_ORDER.indexOf(tier);
}

/** The next tier up, or null at the top. */
export function nextTier(tier: Tier): PaidTier | null {
  const next = TIER_ORDER[tierRank(tier) + 1];
  return next && next !== 'free' ? next : null;
}

/** The lowest tier whose limits pass `ok`, or null if none does. */
export function lowestTierWhere(ok: (l: TierLimits) => boolean): Tier | null {
  return TIER_ORDER.find((t) => ok(TIERS[t].limits)) ?? null;
}

const count = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US') : 'Unlimited');

/** Feature lines for a tier, written from its limits. */
export function featuresFor(tier: Tier): string[] {
  const l = limitsFor(tier);
  const lines = [
    Number.isFinite(l.exportsPerMonth) ? `${count(l.exportsPerMonth)} exports a month` : 'Unlimited exports',
    `Batches of ${l.batchSize}`,
    l.allCaptionStyles ? 'All caption styles' : 'Free caption styles',
    l.watermark ? 'Small watermark' : 'No watermark',
  ];
  if (l.uhd) lines.push('4K export');
  return lines;
}

export type PlanInfo = TierInfo & { features: string[] };

export function planFor(tier: Tier): PlanInfo {
  return { ...TIERS[tier], features: featuresFor(tier) };
}

/** The three paid plans the paywall offers, lowest first. */
export const PLANS: PlanInfo[] = PAID_TIERS.map(planFor);

/** Whole-percent saving of paying annually over 12 monthly payments. */
export function annualSavingPercent(plan: Pick<TierInfo, 'price'>): number {
  if (!plan.price) return 0;
  return Math.round((1 - plan.price.annual / (plan.price.monthly * 12)) * 100);
}

/** The saving shown on the Annual toggle: the smallest across the paid plans, so it's true for each. */
export function annualSavingPill(): number {
  return Math.min(...PLANS.map(annualSavingPercent));
}

export const money = (n: number) => `$${n.toFixed(2)}`;

/** "$159.99 a year", "$19.99 a month". `localized`: the App Store's price text, used instead of the USD price. */
export function priceLine(plan: Pick<TierInfo, 'price'>, billing: Billing, localized?: string): string {
  if (!plan.price) return 'Free';
  return `${localized ?? money(plan.price[billing])} a ${billing === 'annual' ? 'year' : 'month'}`;
}

/** Annual price as a monthly figure, "$13.33 a month". */
export function perMonth(plan: Pick<TierInfo, 'price'>, localized?: string): string | null {
  return plan.price ? `${localized ?? money(plan.price.annual / 12)} a month` : null;
}

/** The renewal sentence under the button. `trial` false: already subscribed, so no second free trial. */
export function renewalLine(plan: Pick<TierInfo, 'price'>, billing: Billing, trial = true, localized?: string): string {
  if (!plan.price) return 'Free has no trial and no payment.';
  const price = priceLine(plan, billing, localized);
  const start = trial ? `Free for ${TRIAL_DAYS} days, then ${price}.` : `${price}.`;
  return `${start} Renews automatically until you cancel in Settings at least 24 hours before the end of the period.`;
}

export const TERMS_URL = 'https://ibrahim1774.github.io/tenfold/terms.html';
export const PRIVACY_URL = 'https://ibrahim1774.github.io/tenfold/privacy.html';
