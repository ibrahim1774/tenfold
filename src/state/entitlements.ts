import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

// Free vs Pro (spec §5.3). M5 replaces `isPro` with Superwall subscription status.
export const FREE_LIMITS = {
  exportsPerMonth: 3,
  batchSize: 5,
} as const;

export const PRO_BATCH_SIZE = 20;

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
};

type EntitlementsState = {
  isPro: boolean;
  exportMonth: string;
  exportsUsed: number;
  setPro: (isPro: boolean) => void;
  recordExport: () => void;
};

export const useEntitlements = create<EntitlementsState>()(
  persist(
    (set) => ({
      isPro: false,
      exportMonth: monthKey(),
      exportsUsed: 0,
      setPro: (isPro) => set({ isPro }),
      recordExport: () =>
        set((s) => (s.exportMonth === monthKey() ? { exportsUsed: s.exportsUsed + 1 } : { exportMonth: monthKey(), exportsUsed: 1 })),
    }),
    { name: 'tenfold.entitlements', storage: persistStorage },
  ),
);

export function maxBatchSize(isPro: boolean) {
  return isPro ? PRO_BATCH_SIZE : FREE_LIMITS.batchSize;
}

/** Free exports left this month (Infinity for Pro). */
export function exportsLeft(s: Pick<EntitlementsState, 'isPro' | 'exportMonth' | 'exportsUsed'>): number {
  if (s.isPro) return Infinity;
  const used = s.exportMonth === monthKey() ? s.exportsUsed : 0;
  return Math.max(0, FREE_LIMITS.exportsPerMonth - used);
}
