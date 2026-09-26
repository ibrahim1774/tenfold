import { captionSettingsFromPreset } from '../captions/presets';
import type { BatchPreset, CaptionStyleId, PresetId } from '../engine/types';
import { useLibrary } from './library';
import { batchPreset } from './presets';

// Batch setup edits the batch's preset in place (the batch is created at import).

const lib = () => useLibrary.getState();

export function setPresetId(batchId: string, id: PresetId) {
  lib().updateBatch(batchId, { preset: batchPreset(id), captionsOff: false });
}

/** Any manual change turns the preset into "Custom". */
export function updatePreset(batchId: string, patch: (p: BatchPreset) => BatchPreset) {
  const b = lib().batches[batchId];
  if (b) lib().updateBatch(batchId, { preset: { ...patch(b.preset), presetId: 'custom' } });
}

export function setCaptionStyle(batchId: string, id: CaptionStyleId | 'off') {
  const b = lib().batches[batchId];
  if (!b) return;
  if (id === 'off') lib().updateBatch(batchId, { captionsOff: true, preset: { ...b.preset, presetId: 'custom' } });
  else lib().updateBatch(batchId, { captionsOff: false, preset: { ...b.preset, presetId: 'custom', captions: captionSettingsFromPreset(id) } });
}
