import { create } from 'zustand';

import { captionSettingsFromPreset } from '../captions/presets';
import type { BatchPreset, CaptionStyleId, PresetId } from '../engine/types';
import { mockProjects } from '../mock/data';
import { batchPreset } from './presets';

type BatchSetupState = {
  clipIds: string[];
  preset: BatchPreset;
  captionsOff: boolean;
  setPresetId: (id: PresetId) => void;
  update: (patch: (p: BatchPreset) => BatchPreset) => void;
  setCaptionStyle: (id: CaptionStyleId | 'off') => void;
  removeClip: (id: string) => void;
  reset: () => void;
};

const initialClips = () => mockProjects.slice(0, 5).map((p) => p.id);

export const useBatchSetup = create<BatchSetupState>((set) => ({
  clipIds: initialClips(),
  preset: batchPreset('cleanTalk'),
  captionsOff: false,
  setPresetId: (id) => set({ preset: batchPreset(id), captionsOff: false }),
  // Any manual change turns the preset into "Custom".
  update: (patch) => set((s) => ({ preset: { ...patch(s.preset), presetId: 'custom' } })),
  setCaptionStyle: (id) =>
    set((s) =>
      id === 'off'
        ? { captionsOff: true, preset: { ...s.preset, presetId: 'custom' } }
        : {
            captionsOff: false,
            preset: { ...s.preset, presetId: 'custom', captions: captionSettingsFromPreset(id) },
          },
    ),
  removeClip: (id) => set((s) => ({ clipIds: s.clipIds.filter((c) => c !== id) })),
  reset: () => set({ clipIds: initialClips(), preset: batchPreset('cleanTalk'), captionsOff: false }),
}));
