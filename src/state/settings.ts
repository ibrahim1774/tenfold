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
  defaultPreset: PresetId;
  contentTypes: ContentType[];
  platforms: Platform[];
  setOnboarded: (v: boolean) => void;
  setSpeech: (s: SpeechState, progress?: number, locale?: string) => void;
  setLanguage: (v: string) => void;
  setDefaultPreset: (id: PresetId) => void;
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
      defaultPreset: 'cleanTalk',
      contentTypes: [],
      platforms: [],
      setOnboarded: (onboarded) => set({ onboarded }),
      setSpeech: (speech, speechProgress = 0, speechLocale) =>
        set((s) => ({ speech, speechProgress, speechLocale: speechLocale ?? s.speechLocale })),
      setLanguage: (language) => set({ language }),
      setDefaultPreset: (defaultPreset) => set({ defaultPreset }),
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
