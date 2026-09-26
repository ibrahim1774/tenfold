import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { PresetId } from '../engine/types';
import { persistStorage } from './storage';

export type SpeechState = 'unknown' | 'unsupported' | 'supported' | 'downloading' | 'installed';
export type ContentType = 'talking' | 'podcast' | 'tutorial' | 'vlog' | 'ads';
export type Platform = 'tiktok' | 'reels' | 'shorts' | 'youtube' | 'linkedin';

type SettingsState = {
  onboarded: boolean;
  speech: SpeechState;
  speechProgress: number;
  speechLocale: string;
  language: string;
  exportQuality: 'hd' | 'uhd';
  defaultPreset: PresetId;
  keepHDR: boolean;
  contentTypes: ContentType[];
  platforms: Platform[];
  setOnboarded: (v: boolean) => void;
  setSpeech: (s: SpeechState, progress?: number, locale?: string) => void;
  setLanguage: (v: string) => void;
  setExportQuality: (v: 'hd' | 'uhd') => void;
  setDefaultPreset: (id: PresetId) => void;
  setKeepHDR: (v: boolean) => void;
  setContentTypes: (v: ContentType[]) => void;
  setPlatforms: (v: Platform[]) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      onboarded: false,
      speech: 'unknown',
      speechProgress: 0,
      speechLocale: '',
      language: 'auto',
      exportQuality: 'hd',
      defaultPreset: 'cleanTalk',
      keepHDR: false,
      contentTypes: [],
      platforms: [],
      setOnboarded: (onboarded) => set({ onboarded }),
      setSpeech: (speech, speechProgress = 0, speechLocale) =>
        set((s) => ({ speech, speechProgress, speechLocale: speechLocale ?? s.speechLocale })),
      setLanguage: (language) => set({ language }),
      setExportQuality: (exportQuality) => set({ exportQuality }),
      setDefaultPreset: (defaultPreset) => set({ defaultPreset }),
      setKeepHDR: (keepHDR) => set({ keepHDR }),
      setContentTypes: (contentTypes) => set({ contentTypes }),
      setPlatforms: (platforms) => set({ platforms }),
    }),
    {
      name: 'tenfold.settings',
      storage: persistStorage,
      // Speech status is re-read from iOS on launch.
      partialize: ({ speechProgress: _p, speech: _s, ...rest }) => rest,
    },
  ),
);

/** Maps the onboarding answers to a starting preset. */
export function presetForContent(types: ContentType[]): PresetId {
  if (types.includes('podcast')) return 'podcast';
  if (types.includes('ads')) return 'punchy';
  if (types.includes('vlog')) return 'story';
  return 'cleanTalk';
}
