import type { AspectRatio, Batch, BatchPreset, EditKey, EditSelection, FillerLevel, Project, SilenceLevel, ZoomMode } from '../engine/types';

// Per-video edit selection. The batch preset holds the *style* (caption look, cut strength, frame ratio);
// each video's selection says *which* edits run. One source of truth: always read through editsOf().

export const EDITS: { key: EditKey; label: string; detail: string }[] = [
  { key: 'captions', label: 'Captions', detail: 'Word-by-word, synced to speech' },
  { key: 'fillers', label: 'Filler words', detail: 'Removes um, uh, like' },
  { key: 'pauses', label: 'Pauses', detail: 'Shortens dead air to a natural beat' },
  { key: 'retakes', label: 'Retakes', detail: 'Removes repeated attempts at a sentence' },
  { key: 'zoom', label: 'Zoom', detail: 'Punch-ins that hide the cuts' },
  { key: 'reframe', label: 'Reframe', detail: 'Crops to the batch frame, follows the speaker' },
];

export const ALL_ON: EditSelection = { captions: true, fillers: true, pauses: true, retakes: true, zoom: true, reframe: true };
export const ALL_OFF: EditSelection = { captions: false, fillers: false, pauses: false, retakes: false, zoom: false, reframe: false };

/** Frame ratio used when Reframe is on. */
export function batchAspect(preset: BatchPreset): Exclude<AspectRatio, 'original'> {
  const a = preset.crop.aspect ?? (preset.crop.auto916 ? '9:16' : 'original');
  return a === 'original' ? '9:16' : a;
}

/** Checks a new video starts with, from the batch style. */
export function editsForPreset(p: BatchPreset, captionsOff = false): EditSelection {
  return {
    captions: !captionsOff,
    fillers: p.analysis.fillers !== 'off',
    pauses: p.analysis.silence !== 'off',
    retakes: p.analysis.retakes ?? true,
    zoom: p.zoom.mode !== 'off',
    reframe: (p.crop.aspect ?? (p.crop.auto916 ? '9:16' : 'original')) !== 'original',
  };
}

/** Defaults for a video saved before per-video edits existed. */
export function defaultEdits(batch: Batch): EditSelection {
  return editsForPreset(batch.preset, batch.captionsOff);
}

export function editsOf(project: Pick<Project, 'edits'>, batch: Batch): EditSelection {
  return project.edits ?? defaultEdits(batch);
}

/** Strengths the analysis runs with: the batch's strength when the edit is on, 'off' when it isn't. */
export function effectiveLevels(preset: BatchPreset, edits: EditSelection): { silence: SilenceLevel; fillers: FillerLevel; retakes: boolean } {
  const silence = preset.analysis.silence === 'off' ? 'medium' : preset.analysis.silence;
  const fillers = preset.analysis.fillers === 'off' ? 'standard' : preset.analysis.fillers;
  return { silence: edits.pauses ? silence : 'off', fillers: edits.fillers ? fillers : 'off', retakes: edits.retakes };
}

export function effectiveZoom(preset: BatchPreset, edits: EditSelection): ZoomMode {
  if (!edits.zoom) return 'off';
  return preset.zoom.mode === 'off' ? 'subtle' : preset.zoom.mode;
}

export function sameEdits(a: EditSelection, b: EditSelection): boolean {
  return EDITS.every((e) => a[e.key] === b[e.key]);
}

/**
 * The batch's edits: the selection most clips share (the earliest clip wins a tie). One definition
 * drives the "N clips use different edits" note and the clip sheet's "Same as batch".
 */
export function batchEdits(selections: EditSelection[]): EditSelection | null {
  let best: EditSelection | null = null;
  let bestCount = 0;
  for (const s of selections) {
    const n = selections.filter((o) => sameEdits(o, s)).length;
    if (n > bestCount) {
      best = s;
      bestCount = n;
    }
  }
  return best;
}

/** How many clips differ from the batch's edits. */
export function clipsDiffering(selections: EditSelection[]): number {
  const common = batchEdits(selections);
  return common ? selections.filter((s) => !sameEdits(s, common)).length : 0;
}

/** Short summary for a video row, e.g. "Captions · Fillers · Pauses". */
export function editsSummary(edits: EditSelection): string {
  const on = EDITS.filter((e) => edits[e.key]).map((e) => e.label);
  if (on.length === 0) return 'No edits: exported as is';
  if (on.length === EDITS.length) return 'All edits';
  return on.join(' · ');
}
