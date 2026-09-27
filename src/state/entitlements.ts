import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

// Free / Pro / Studio (spec §5.3). M5 replaces the local `tier` with Superwall subscription status.
export type Tier = 'free' | 'pro' | 'studio';

export const FREE_LIMITS = {
  exportsPerMonth: 3,
  batchSize: 10,
} as const;

export const PRO_BATCH_SIZE = 20;
export const STUDIO_BATCH_SIZE = 50;

export const TIER_NAMES: Record<Tier, string> = { free: 'Starter', pro: 'Pro', studio: 'Studio' };

const monthKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}`;

type EntitlementsState = {
  tier: Tier;
  /** Derived: `tier !== 'free'`. Kept as a field so existing readers (`s.isPro`) keep working. */
  isPro: boolean;
  exportMonth: string;
  exportsUsed: number;
  setTier: (tier: Tier) => void;
  /** Legacy: true = Pro, false = free. */
  setPro: (isPro: boolean) => void;
  recordExport: () => void;
};

export const useEntitlements = create<EntitlementsState>()(
  persist(
    (set) => ({
      tier: 'free',
      isPro: false,
      exportMonth: monthKey(),
      exportsUsed: 0,
      setTier: (tier) => set({ tier, isPro: tier !== 'free' }),
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
  if (s.tier && s.tier !== 'free') return s.tier;
  return s.isPro ? 'pro' : 'free';
}

/** Clips per batch. Accepts a tier, or the legacy Pro boolean. */
export function maxBatchSize(t: Tier | boolean): number {
  const tier: Tier = typeof t === 'boolean' ? (t ? 'pro' : 'free') : t;
  return tier === 'studio' ? STUDIO_BATCH_SIZE : tier === 'pro' ? PRO_BATCH_SIZE : FREE_LIMITS.batchSize;
}

/** Free exports used this month (0 after the month rolls over). */
export function exportsUsedThisMonth(s: Pick<EntitlementsState, 'exportMonth' | 'exportsUsed'>): number {
  return s.exportMonth === monthKey() ? s.exportsUsed : 0;
}

/** Free exports left this month (Infinity for Pro and Studio). */
export function exportsLeft(s: Pick<EntitlementsState, 'isPro' | 'exportMonth' | 'exportsUsed'> & { tier?: Tier }): number {
  if (tierOf({ tier: s.tier ?? 'free', isPro: s.isPro }) !== 'free') return Infinity;
  return Math.max(0, FREE_LIMITS.exportsPerMonth - exportsUsedThisMonth(s));
}

/** First day of next month: when the free export count resets. */
export function exportsResetDate(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}
