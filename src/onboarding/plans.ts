import { FREE_LIMITS, PRO_BATCH_SIZE, STUDIO_BATCH_SIZE, type Tier } from '../state/entitlements';

// TODO(M5, Superwall): products, localized prices and trial eligibility come from Superwall.
// These placeholder prices exist only so the paywall layout and maths can be built and tested.

export type Billing = 'monthly' | 'annual';

export const TRIAL_DAYS = 3;

export type PlanInfo = {
  tier: Tier;
  name: string;
  /** Placeholder prices in USD; null = free. */
  price: Record<Billing, number> | null;
  features: string[];
};

export const PLANS: PlanInfo[] = [
  {
    tier: 'free',
    name: 'Starter',
    price: null,
    features: [`Batches of ${FREE_LIMITS.batchSize}`, `${FREE_LIMITS.exportsPerMonth} exports a month`, 'Free caption styles', 'Small watermark'],
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: { monthly: 9.99, annual: 79.99 },
    features: [`Batches of ${PRO_BATCH_SIZE}`, 'Unlimited exports', 'All caption styles', 'No watermark', '4K export'],
  },
  {
    tier: 'studio',
    name: 'Studio',
    price: { monthly: 19.99, annual: 159.99 },
    // TODO: 4K and Keep HDR aren't Studio-only today (4K is in Pro, Keep HDR is ungated), so they aren't listed here.
    features: ['Everything in Pro', `Batches of ${STUDIO_BATCH_SIZE}`],
  },
];

export function planFor(tier: Tier): PlanInfo {
  return PLANS.find((p) => p.tier === tier) ?? PLANS[0];
}

/** Whole-percent saving of paying annually over 12 monthly payments. */
export function annualSavingPercent(plan: PlanInfo): number {
  if (!plan.price) return 0;
  return Math.round((1 - plan.price.annual / (plan.price.monthly * 12)) * 100);
}

export const money = (n: number) => `$${n.toFixed(2)}`;

/** "$79.99 a year", "$9.99 a month". */
export function priceLine(plan: PlanInfo, billing: Billing): string {
  if (!plan.price) return 'Free';
  return `${money(plan.price[billing])} a ${billing === 'annual' ? 'year' : 'month'}`;
}

/** Annual price as a monthly figure, "$6.67 a month". */
export function perMonth(plan: PlanInfo): string | null {
  return plan.price ? `${money(plan.price.annual / 12)} a month` : null;
}

/** The renewal sentence under the button. */
export function renewalLine(plan: PlanInfo, billing: Billing): string {
  if (!plan.price) return 'Starter is free. No trial, no payment.';
  return `Free for ${TRIAL_DAYS} days, then ${priceLine(plan, billing)}. Renews automatically until you cancel in Settings at least 24 hours before the end of the period.`;
}
