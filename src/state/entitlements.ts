import { create } from 'zustand';

// Free vs Pro (spec §5.3). M5 replaces the mock with Superwall subscription status.
export const FREE_LIMITS = {
  exportsPerMonth: 3,
  batchSize: 5,
  maxResolution: '1080p',
} as const;

export const PRO_BATCH_SIZE = 20;

type EntitlementsState = {
  isPro: boolean;
  exportsUsedThisMonth: number;
  setPro: (isPro: boolean) => void;
};

export const useEntitlements = create<EntitlementsState>((set) => ({
  isPro: false,
  exportsUsedThisMonth: 0,
  setPro: (isPro) => set({ isPro }),
}));

export function maxBatchSize(isPro: boolean) {
  return isPro ? PRO_BATCH_SIZE : FREE_LIMITS.batchSize;
}
