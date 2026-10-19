// The one source of truth for tiers: names, prices, App Store products and limits.
// `src/state/entitlements.ts` reads its limits from here; the paywall and the You tab read the copy.
// Every price shown to people is the App Store's, localized; these USD prices are the list prices (annual saving
// in tests, revenue on attribution events).
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
  /** Starts with a TRIAL_DAYS free trial (App Store introductory offer on both billings). */
  trial: boolean;
  limits: TierLimits;
};

export const TIERS: Record<Tier, TierInfo> = {
  free: {
    tier: 'free',
    name: 'Free',
    price: null,
    trial: false,
    limits: { exportsPerMonth: 3, batchSize: 10, allCaptionStyles: false, watermark: true, uhd: false },
  },
  starter: {
    tier: 'starter',
    name: 'Starter',
    price: { monthly: 9.99, annual: 79.99 },
    // No trial on Starter (2026-09-29): Pro and Studio start with 3 days free.
    trial: false,
    limits: { exportsPerMonth: 30, batchSize: 20, allCaptionStyles: true, watermark: false, uhd: false },
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    price: { monthly: 19.99, annual: 159.99 },
    trial: true,
    limits: { exportsPerMonth: 300, batchSize: 50, allCaptionStyles: true, watermark: false, uhd: true },
  },
  studio: {
    tier: 'studio',
    name: 'Studio',
    price: { monthly: 49.99, annual: 399.99 },
    trial: true,
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

/**
 * Feature lines for a tier, written from its limits. The first is the fact that tells the plans apart on the
 * paywall. Batch sizes and the watermark aren't advertised (the owner's call, and there is no free plan).
 */
export function featuresFor(tier: Tier): string[] {
  const l = limitsFor(tier);
  return [
    Number.isFinite(l.exportsPerMonth) ? `${count(l.exportsPerMonth)} exports a month` : 'Unlimited exports',
    l.allCaptionStyles ? 'All caption styles' : 'Free caption styles',
  ];
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

/**
 * The same from the App Store's prices (any currency): the smallest across the plans whose monthly and annual
 * prices both loaded, or null when none has (the toggle then shows no saving).
 */
export function storeAnnualSaving(prices: Partial<Record<string, { price: number }>> | undefined): number | null {
  const savings = PAID_TIERS.flatMap((t) => {
    const monthly = prices?.[PRODUCT_IDS[t].monthly]?.price;
    const annual = prices?.[PRODUCT_IDS[t].annual]?.price;
    return monthly && annual ? [annualSavingPercent({ price: { monthly, annual } })] : [];
  });
  return savings.length ? Math.min(...savings) : null;
}

/** "a year", "a month". */
export const periodWord = (billing: Billing) => (billing === 'annual' ? 'a year' : 'a month');

/**
 * "$159.99 a year", "$19.99 a month". `localized`: the App Store's price text. There is no USD fallback: the
 * paywall shows no price, and sells nothing, until the App Store's prices have loaded.
 */
export function priceLine(billing: Billing, localized: string): string {
  return `${localized} ${periodWord(billing)}`;
}

/** What the plan charges, trial first only when the App Store says this Apple ID gets one: "Free for 3 days, then $19.99 a month." */
export function chargeLine(billing: Billing, localized: string, trial: boolean, trialDays = TRIAL_DAYS): string {
  const price = priceLine(billing, localized);
  return trial ? `Free for ${trialDays} days, then ${price}.` : `${price}.`;
}

export const RENEWAL_TERMS = 'Renews automatically until you cancel in Settings at least 24 hours before the end of the period.';

/** The full renewal disclosure under the button. `trial` false: not eligible (or not known yet), so no trial is promised. */
export function renewalLine(billing: Billing, localized: string, trial: boolean, trialDays = TRIAL_DAYS): string {
  return `${chargeLine(billing, localized, trial, trialDays)} ${RENEWAL_TERMS}`;
}

/**
 * Whether to promise a free trial for a plan: the plan has one (Pro, Studio; never Starter) and StoreKit says this
 * Apple ID can still get it (one introductory offer per subscription group). Unknown, loading or failed: no.
 * The App Store's own purchase sheet still applies a trial the person is eligible for.
 */
export function trialShown(plan: Pick<TierInfo, 'trial'>, offer: { freeTrial: boolean } | null | undefined): boolean {
  return plan.trial && offer?.freeTrial === true;
}

/**
 * True when a plan change bought now starts at the next renewal rather than at once. Apple applies a move to a
 * lower level (Studio → Pro → Starter) and a switch between monthly and annual on the same plan (same level,
 * other length) when the current period ends; upgrades start straight away.
 */
export function changeStartsAtRenewal(current: Tier, currentBilling: Billing | null, tier: PaidTier, billing: Billing): boolean {
  if (current === 'free') return false;
  return tierRank(tier) < tierRank(current) || (tier === current && currentBilling !== null && billing !== currentBilling);
}

/**
 * The paywall's button. Never trial wording: the billed price is the screen's most prominent price and the
 * trial sits under it in smaller type (guideline 3.1.2(c)).
 */
export function ctaTitle(current: Tier, currentBilling: Billing | null, tier: PaidTier, billing: Billing): string {
  const name = TIERS[tier].name;
  if (tier === current) {
    return !currentBilling || billing === currentBilling ? `Keep ${name}` : `Switch to ${name} ${billing === 'annual' ? 'Annual' : 'Monthly'}`;
  }
  return current === 'free' ? `Get ${name}` : `Switch to ${name}`;
}

/** The note shown after such a change, instead of closing as if it had already happened. */
export function renewalChangeNote(current: PaidTier, tier: PaidTier, billing: Billing): string {
  const next = `${TIERS[tier].name} ${billing === 'annual' ? 'Annual' : 'Monthly'}`;
  return tier === current
    ? `Done. ${next} starts at your next renewal.`
    : `Done. ${next} starts at your next renewal. You keep ${TIERS[current].name} until then.`;
}

export const TERMS_URL = 'https://ibrahim1774.github.io/tenfold/terms.html';
export const PRIVACY_URL = 'https://ibrahim1774.github.io/tenfold/privacy.html';
export const SUPPORT_EMAIL = 'support@davoxa.com';
