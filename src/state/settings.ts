import { create } from 'zustand';

import type { PresetId } from '../engine/types';

export type SpeechModelState = 'notDownloaded' | 'downloading' | 'installed';

type SettingsState = {
  onboarded: boolean;
  speechModel: SpeechModelState;
  modelProgress: number;
  defaultPreset: PresetId;
  keepHDR: boolean;
  setOnboarded: (v: boolean) => void;
  setSpeechModel: (s: SpeechModelState, progress?: number) => void;
  setDefaultPreset: (id: PresetId) => void;
  setKeepHDR: (v: boolean) => void;
};

// M0: in-memory only. Persisted to expo-sqlite `settings` table in M1.
export const useSettings = create<SettingsState>((set) => ({
  onboarded: false,
  speechModel: 'notDownloaded',
  modelProgress: 0,
  defaultPreset: 'cleanTalk',
  keepHDR: false,
  setOnboarded: (onboarded) => set({ onboarded }),
  setSpeechModel: (speechModel, modelProgress = 0) => set({ speechModel, modelProgress }),
  setDefaultPreset: (defaultPreset) => set({ defaultPreset }),
  setKeepHDR: (keepHDR) => set({ keepHDR }),
}));
