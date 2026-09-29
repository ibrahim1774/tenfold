import { captionSettingsFromPreset } from '../captions/presets';
import { ALL_OFF, ALL_ON, editsOf } from '../batch/edits';
import type { BatchPreset, CaptionStyleId, EditKey, EditSelection, PresetId } from '../engine/types';
import { useLibrary } from './library';
import { useSettings } from './settings';
import { batchPreset } from './presets';

// Batch setup edits the batch's preset in place (the batch is created at import).

const lib = () => useLibrary.getState();

/** A preset sets the style only; which edits run stays whatever the person selected. */
export function setPresetId(batchId: string, id: PresetId) {
  const preset = batchPreset(id, useSettings.getState().platforms);
  lib().updateBatch(batchId, { preset, captionsOff: false });
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

/** Turns one edit on or off for the given videos (all of the batch's videos when `projectIds` is omitted). */
export function setEdit(batchId: string, key: EditKey, value: boolean, projectIds?: string[]) {
  const b = lib().batches[batchId];
  if (!b) return;
  for (const id of projectIds ?? b.projectIds) {
    const p = lib().projects[id];
    if (p) lib().updateProject(id, { edits: { ...editsOf(p, b), [key]: value } });
  }
}

/** "Select all" / "Clear all" for every edit on every video. */
export function setAllEdits(batchId: string, value: boolean) {
  const b = lib().batches[batchId];
  if (!b) return;
  for (const id of b.projectIds) lib().updateProject(id, { edits: value ? { ...ALL_ON } : { ...ALL_OFF } });
}

/** Replaces one video's edits (the clip sheet's "Same as batch"). */
export function setClipEdits(projectId: string, edits: EditSelection) {
  if (lib().projects[projectId]) lib().updateProject(projectId, { edits: { ...edits } });
}
