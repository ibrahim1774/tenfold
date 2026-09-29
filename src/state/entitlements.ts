import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { limitsFor, TIERS, type Billing, type Tier } from '../onboarding/plans';
import { persistStorage } from './storage';

// The tier in effect on this iPhone. Superwall's subscription status sets it (src/monetization);
// the persisted value is the last known tier, used when Superwall can't answer (old build, offline).
// Limits come from the table in src/onboarding/plans.ts.
export type { Tier } from '../onboarding/plans';

export const TIER_NAMES: Record<Tier, string> = {
  free: TIERS.free.name,
  starter: TIERS.starter.name,
  pro: TIERS.pro.name,
  studio: TIERS.studio.name,
};

const monthKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}`;

type EntitlementsState = {
  tier: Tier;
  /** Billing period of the active subscription, when Superwall has told us; null on Free or when unknown. */
  billing: Billing | null;
  /** Derived: any paid tier (`tier !== 'free'`). Kept as a field so existing readers (`s.isPro`) keep working. */
  isPro: boolean;
  exportMonth: string;
  exportsUsed: number;
  /** Sets the tier; keeps the billing period for a paid tier, clears it for Free. */
  setTier: (tier: Tier) => void;
  /** Tier and billing period together (Superwall's status and purchases). The month's export count is kept. */
  setPlan: (plan: { tier: Tier; billing: Billing | null }) => void;
  /** Legacy: true = Pro, false = free. */
  setPro: (isPro: boolean) => void;
  recordExport: () => void;
};

export const useEntitlements = create<EntitlementsState>()(
  persist(
    (set) => ({
      tier: 'free',
      billing: null,
      isPro: false,
      exportMonth: monthKey(),
      exportsUsed: 0,
      setTier: (tier) => set((s) => ({ tier, isPro: tier !== 'free', billing: tier === 'free' ? null : s.billing })),
      setPlan: ({ tier, billing }) => set({ tier, isPro: tier !== 'free', billing: tier === 'free' ? null : billing }),
      setPro: (isPro) => set({ tier: isPro ? 'pro' : 'free', isPro }),
      recordExport: () =>
        set((s) => (s.exportMonth === monthKey() ? { exportsUsed: s.exportsUsed + 1 } : { exportMonth: monthKey(), exportsUsed: 1 })),
    }),
    {
      name: 'tenfold.entitlements',
      storage: persistStorage,
      version: 1,
      // v0 stored only `isPro`.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<EntitlementsState>;
        if (version < 1) return { ...s, tier: s.isPro ? 'pro' : 'free' } as EntitlementsState;
        return s as EntitlementsState;
      },
    },
  ),
);

/** The tier in effect. A bare `isPro: true` (older state, tests) counts as Pro. */
export function tierOf(s: Pick<EntitlementsState, 'tier' | 'isPro'>): Tier {
  if (s.tier && s.tier !== 'free' && s.tier in TIERS) return s.tier;
  return s.isPro ? 'pro' : 'free';
}

const asTier = (t: Tier | boolean): Tier => (typeof t === 'boolean' ? (t ? 'pro' : 'free') : t);

/** Clips per batch. Accepts a tier, or the legacy Pro boolean. */
export function maxBatchSize(t: Tier | boolean): number {
  return limitsFor(asTier(t)).batchSize;
}

/** Exports a month for a tier (Infinity = unlimited). */
export function exportLimit(t: Tier | boolean): number {
  return limitsFor(asTier(t)).exportsPerMonth;
}

/** True when a caption style can be used on this tier (`free` is the style's own flag). */
export function captionStyleUnlocked(t: Tier | boolean, styleIsFree: boolean): boolean {
  return styleIsFree || limitsFor(asTier(t)).allCaptionStyles;
}

/** Exports used this month (0 after the month rolls over). */
export function exportsUsedThisMonth(s: Pick<EntitlementsState, 'exportMonth' | 'exportsUsed'>, now = new Date()): number {
  return s.exportMonth === monthKey(now) ? s.exportsUsed : 0;
}

/** Exports left this month for the tier in effect (Infinity for unlimited tiers). */
export function exportsLeft(s: Pick<EntitlementsState, 'isPro' | 'exportMonth' | 'exportsUsed'> & { tier?: Tier }, now = new Date()): number {
  const limit = exportLimit(tierOf({ tier: s.tier ?? 'free', isPro: s.isPro }));
  if (!Number.isFinite(limit)) return Infinity;
  return Math.max(0, limit - exportsUsedThisMonth(s, now));
}

/** First day of next month: when the export count resets. */
export function exportsResetDate(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/** "Pro · Annual", "Starter · Monthly", "Studio" (billing not known yet), "Free". */
export function planLabel(tier: Tier, billing: Billing | null): string {
  const name = TIER_NAMES[tier];
  if (tier === 'free' || !billing) return name;
  return `${name} · ${billing === 'annual' ? 'Annual' : 'Monthly'}`;
}

/**
 * This month's exports in one line: "12 of 30 exports used · 18 left · resets Oct 1", or "Unlimited exports".
 * `locale` is for the date only (undefined = the iPhone's).
 */
export function exportUsageLine(
  s: Pick<EntitlementsState, 'tier' | 'isPro' | 'exportMonth' | 'exportsUsed'>,
  now = new Date(),
  locale?: string,
): string {
  const limit = exportLimit(tierOf(s));
  if (!Number.isFinite(limit)) return 'Unlimited exports';
  // After a downgrade the month's count can be over the new limit: show it as full, not "50 of 30".
  const used = Math.min(limit, exportsUsedThisMonth(s, now));
  const left = limit - used;
  const resets = exportsResetDate(now).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return `${used} of ${limit} exports used · ${left} left · resets ${resets}`;
}
