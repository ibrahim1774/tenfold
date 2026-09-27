import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '../state/storage';

const MAX = 6;

type RecentColors = { colors: string[]; add: (hex: string) => void };

/** The last six caption colours picked, newest first (shown at the start of the swatch grid). */
export const useRecentColors = create<RecentColors>()(
  persist(
    (set) => ({
      colors: [],
      add: (hex) =>
        set((s) => {
          const c = hex.toUpperCase();
          return { colors: [c, ...s.colors.filter((x) => x !== c)].slice(0, MAX) };
        }),
    }),
    { name: 'tenfold.recentColors', storage: persistStorage, version: 1, partialize: (s) => ({ colors: s.colors }) },
  ),
);
