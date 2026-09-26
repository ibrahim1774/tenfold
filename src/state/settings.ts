import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { PresetId } from '../engine/types';
import { persistStorage } from './storage';

export type SpeechModelState = 'notDownloaded' | 'downloading' | 'installed';
export type ContentType = 'talking' | 'podcast' | 'tutorial' | 'vlog' | 'ads';
export type Platform = 'tiktok' | 'reels' | 'shorts' | 'youtube' | 'linkedin';

type SettingsState = {
  onboarded: boolean;
  speechModel: SpeechModelState;
  modelProgress: number;
  defaultPreset: PresetId;
  keepHDR: boolean;
  contentTypes: ContentType[];
  platforms: Platform[];
  setOnboarded: (v: boolean) => void;
  setSpeechModel: (s: SpeechModelState, progress?: number) => void;
  setDefaultPreset: (id: PresetId) => void;
  setKeepHDR: (v: boolean) => void;
  setContentTypes: (v: ContentType[]) => void;
  setPlatforms: (v: Platform[]) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      onboarded: false,
      speechModel: 'notDownloaded',
      modelProgress: 0,
      defaultPreset: 'cleanTalk',
      keepHDR: false,
      contentTypes: [],
      platforms: [],
      setOnboarded: (onboarded) => set({ onboarded }),
      setSpeechModel: (speechModel, modelProgress = 0) => set({ speechModel, modelProgress }),
      setDefaultPreset: (defaultPreset) => set({ defaultPreset }),
      setKeepHDR: (keepHDR) => set({ keepHDR }),
      setContentTypes: (contentTypes) => set({ contentTypes }),
      setPlatforms: (platforms) => set({ platforms }),
    }),
    {
      name: 'tenfold.settings',
      storage: persistStorage,
      // A download in flight can't survive a relaunch; M1 resumes it natively.
      partialize: ({ modelProgress: _p, ...rest }) => ({
        ...rest,
        speechModel: rest.speechModel === 'downloading' ? 'notDownloaded' : rest.speechModel,
      }),
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
