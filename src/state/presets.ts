import { captionSettingsFromPreset } from '../captions/presets';
import type { BatchPreset, PresetId } from '../engine/types';

export const PRESET_OPTIONS: { id: PresetId; name: string; blurb: string }[] = [
  { id: 'cleanTalk', name: 'Clean Talk', blurb: 'Medium cuts, Pop captions, subtle zoom' },
  { id: 'punchy', name: 'Punchy', blurb: 'Aggressive cuts, dynamic zoom' },
  { id: 'podcast', name: 'Podcast', blurb: 'Light cuts, boxed captions, no zoom' },
  { id: 'story', name: 'Story', blurb: 'Light cuts, minimal captions' },
  { id: 'custom', name: 'Custom', blurb: 'Your own settings' },
];

export function batchPreset(id: PresetId): BatchPreset {
  const base: BatchPreset = {
    presetId: id,
    analysis: { silence: 'medium', fillers: 'standard', language: 'auto' },
    captions: captionSettingsFromPreset('pop'),
    zoom: { mode: 'subtle', intensity: 2, faceFollow: true },
    crop: { auto916: true },
    audio: { mode: 'original' },
    autoExport: false,
  };
  switch (id) {
    case 'punchy':
      return {
        ...base,
        analysis: { ...base.analysis, silence: 'aggressive', fillers: 'aggressive' },
        zoom: { ...base.zoom, mode: 'dynamic', intensity: 3 },
      };
    case 'podcast':
      return {
        ...base,
        analysis: { ...base.analysis, silence: 'light' },
        captions: captionSettingsFromPreset('boxed'),
        zoom: { ...base.zoom, mode: 'off' },
        crop: { auto916: false },
      };
    case 'story':
      return {
        ...base,
        analysis: { ...base.analysis, silence: 'light' },
        captions: captionSettingsFromPreset('minimal'),
      };
    default:
      return base;
  }
}
