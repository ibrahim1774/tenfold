// Text overlays: each edit is one undo step, revert clears them, batch copy, clamp parity with Swift,
// output-time mapping across a cut.
import { revertToOriginal } from '@/captions/edits';
import { captionSettingsFromPreset } from '@/captions/presets';
import { clampCenter, contrastText, luminance, overlayMetrics, overlayWindow, TEXT_STYLES } from '@/editor/textLayout';
import {
  copyOverlaysToBatch,
  newOverlay,
  overlaySourceSpan,
  removeOverlay,
  retimeOverlay,
  setWholeClip,
  updateOverlay,
  upsertOverlay,
} from '@/editor/textOverlays';
import type { CompSegment, EditDocument } from '../../src/engine/types';
import { commitDoc, undoDoc, useEditHistory } from '@/state/history';
import { useLibrary } from '@/state/library';

type Check = (c: boolean, m: string) => void;

const PID = 'text-overlay-test';
const doc = () => useLibrary.getState().docs[PID];
const past = () => useEditHistory.getState().past[PID]?.length ?? 0;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

function baseDoc(): EditDocument {
  return {
    version: 1,
    cuts: [],
    wordOverrides: [],
    captions: captionSettingsFromPreset('pop'),
    zoom: { mode: 'off', intensity: 2, faceFollow: true },
    crop: { auto916: true, aspect: '9:16' },
    audio: { mode: 'original' },
  };
}

/** Commits and checks it is one history entry; returns the document after it (kept, not undone). */
function step(check: Check, name: string, next: EditDocument | null) {
  if (!next) {
    check(false, `${name}: produced an edit`);
    return null;
  }
  const n0 = past();
  commitDoc(PID, next);
  check(past() === n0 + 1, `${name}: one history entry (${past() - n0})`);
  return doc();
}

export function runTextOverlayTests(check: Check) {
  console.log('• text overlays: add / edit / move / delete are one undo step each');
  useLibrary.getState().setDoc(PID, baseDoc());
  useEditHistory.setState((h) => ({ past: { ...h.past, [PID]: [] }, future: { ...h.future, [PID]: [] } }));

  const t = { ...newOverlay('t1', 'retro', 'POV: day 1') };
  check(t.color === '#FFF3D6' && t.size === 0.07 && t.x === 0.5 && t.start === undefined, 'new overlay: style colour, default size, centred, whole clip');
  const added = step(check, 'add', upsertOverlay(doc(), t));
  check(added?.textOverlays?.length === 1, 'added');
  const edited = step(check, 'edit', updateOverlay(doc(), 't1', { text: 'POV: day 2', box: 'filled', align: 'left' }));
  check(edited?.textOverlays?.[0].text === 'POV: day 2' && edited.textOverlays[0].box === 'filled', 'edited text and box');
  const moved = step(check, 'move', updateOverlay(doc(), 't1', { x: 0.3, y: 0.2, size: 0.5, rotation: 15 }));
  check(moved?.textOverlays?.[0].size === 0.2 && moved.textOverlays[0].rotation === 15, `size clamps to 0.2 (${moved?.textOverlays?.[0].size})`);
  check(updateOverlay(doc(), 't1', { x: 0.3 }) === null, 'a move that changes nothing is not an edit');
  const retimed = step(check, 'retime', retimeOverlay(doc(), 't1', { start: 1.2, end: 3 }, 10));
  check(retimed?.textOverlays?.[0].start === 1.2 && retimed.textOverlays[0].end === 3, 'retimed 1.2–3');
  const snapped = retimeOverlay(doc(), 't1', { start: 0.02 }, 10);
  check(snapped?.textOverlays?.[0].start === undefined && snapped?.textOverlays?.[0].end === 3, 'a start dragged to 0 means from the start');
  const tooShort = retimeOverlay(doc(), 't1', { end: 1.25 }, 10);
  check(near(tooShort?.textOverlays?.[0].end ?? 0, 1.5), `never shorter than 0.3 s (${tooShort?.textOverlays?.[0].end})`);
  const whole = step(check, 'whole clip', setWholeClip(doc(), 't1'));
  check(!!whole && !('start' in whole.textOverlays![0]) && !('end' in whole.textOverlays![0]), 'whole clip stores no times');
  step(check, 'add second', upsertOverlay(doc(), newOverlay('t2', 'neon', 'Wait for it')));
  const removed = step(check, 'delete', removeOverlay(doc(), 't2'));
  check(removed?.textOverlays?.map((o) => o.id).join() === 't1', 'deleted t2 only');
  const n = past();
  undoDoc(PID);
  check(doc().textOverlays?.length === 2 && past() === n - 1, 'undo brings the deleted overlay back');
  const spaced = upsertOverlay(baseDoc(), newOverlay('s', 'classic', '  POV:   day\t1  \n  next line \n\n'));
  check(spaced.textOverlays?.[0].text === 'POV: day 1\nnext line', `whitespace normalised like the engine wraps it (${JSON.stringify(spaced.textOverlays?.[0].text)})`);
  const empty = removeOverlay(removeOverlay(doc(), 't2')!, 't1');
  check(!!empty && empty.textOverlays === undefined, 'deleting the last overlay removes the list');

  console.log('• text overlays: revert to original clears them');
  const reverted = revertToOriginal(doc());
  check(reverted.textOverlays === undefined, 'revert clears overlays');
  const r = step(check, 'revert', reverted);
  undoDoc(PID);
  check(!!r && doc().textOverlays?.length === 2, 'undo of revert restores overlays');

  console.log('• text overlays: copy to the rest of the batch');
  let k = 0;
  const docs: Record<string, EditDocument | undefined> = {
    a: doc(),
    b: { ...baseDoc(), textOverlays: [newOverlay('old', 'bold', 'Old')] },
    c: baseDoc(),
    d: undefined, // still analysing: no document yet
  };
  const copies = copyOverlaysToBatch(docs, 'a', ['a', 'b', 'c', 'd'], () => `n${k++}`);
  check(same(Object.keys(copies).sort(), ['b', 'c']), `other clips with documents only (${Object.keys(copies)})`);
  check(copies.b.textOverlays?.length === 2 && copies.b.textOverlays.every((o) => o.id.startsWith('n')), 'replaces theirs, fresh ids');
  check(copies.c.textOverlays?.[0].text === doc().textOverlays?.[0].text, 'same text and look');
  check(docs.b!.textOverlays?.[0].id === 'old', 'inputs untouched');

  console.log('• text overlays: clamp matches the engine (CoreTests uses the same four cases)');
  const W = 1080;
  const H = 1920;
  const c1 = clampCenter(0.5, 0.5, 200, 100, 0, W, H);
  check(near(c1.x, 0.5) && near(c1.y, 0.5), `centred box stays (${JSON.stringify(c1)})`);
  const c2 = clampCenter(0.95, 0.5, 400, 100, 0, W, H);
  check(near(c2.x, 880 / 1080) && near(c2.y, 0.5), `past the right edge pulls back to 0.8148 (${c2.x})`);
  const c3 = clampCenter(0.05, 0.02, 400, 100, 90, W, H);
  check(near(c3.x, 0.05) && near(c3.y, 200 / 1920), `90° swaps the extents (${JSON.stringify(c3)})`);
  const c4 = clampCenter(0.9, 0.3, 1200, 100, 0, W, H);
  check(near(c4.x, 0.5) && near(c4.y, 0.3), `wider than the canvas centres (${JSON.stringify(c4)})`);
  check(near(luminance('#FF3B30'), 0.2126 + (0.7152 * 59) / 255 + (0.0722 * 48) / 255), 'luma of #FF3B30 (same as CoreTests)');
  check(contrastText('#FFE14D') === '#000000' && contrastText('#FF3B30') === '#FFFFFF', 'contrast text matches the engine');
  const m = overlayMetrics({ ...newOverlay('m', 'neon', 'x'), box: 'outline' }, 390, 693);
  check(near(m.fontSize, 0.07 * 390) && near(m.lineHeight, m.fontSize * 1.25) && near(m.stroke!.width, (6 * 390) / 1080), 'size, line height and outline scale with the short side');
  check(m.family === 'BebasNeue-Regular' && !!m.glow && m.stroke!.color === '#FFFFFF', 'neon: Bebas with a glow; pink (luma 0.49) gets a white outline');
  check(overlayMetrics({ ...newOverlay('w', 'classic', 'x'), box: 'outline' }, 390, 693).stroke!.color === '#000000', 'white text gets a black outline');
  check(TEXT_STYLES.length === 9 && new Set(TEXT_STYLES.map((s) => s.family)).size === 9, 'nine styles, nine fonts');

  console.log('• text overlays: output time across a cut');
  // Source 0.5–1.5 is cut: output 0–0.5 = source 0–0.5, output 0.5–9 = source 1.5–10.
  const segs: CompSegment[] = [
    { start: 0, end: 0.5, compStart: 0, compEnd: 0.5 },
    { start: 1.5, end: 10, compStart: 0.5, compEnd: 9 },
  ];
  const o = { ...newOverlay('o', 'classic', 'Title'), start: 2, end: 3 };
  const span = overlaySourceSpan(o, segs, 9);
  check(near(span.start, 3) && near(span.end, 4), `output 2–3 s sits over source 3–4 s (${JSON.stringify(span)})`);
  check(same(overlayWindow(o, 9), { start: 2, end: 3 }), 'the cut before it doesn’t move it on the output');
  check(same(overlayWindow({ start: 8 }, 8.5), { start: 8, end: 8.5 }), 'an overlay past a shortened video is clipped to it');
}
