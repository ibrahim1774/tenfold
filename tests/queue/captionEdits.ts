// Caption edits and clip trims: each is one undo step, undo restores, reset/revert clear the right things.
import {
  captionText,
  editCaptionText,
  mergeCaption,
  resetCaptionEdits,
  retimeCaption,
  revertToOriginal,
  setCaptionHidden,
  splitCaption,
} from '@/captions/edits';
import { captionSettingsFromPreset, lookOf, presetById, withLook } from '@/captions/presets';
import { trimClip } from '@/editor/trim';
import type { CaptionCard, CompSegment, EditDocument, Word } from '../../src/engine/types';
import { commitDoc, redoDoc, undoDoc, useEditHistory } from '@/state/history';
import { useLibrary } from '@/state/library';

type Check = (c: boolean, m: string) => void;

const w = (text: string, start: number, end: number): Word => ({ text, start, end, confidence: 1, isFiller: false });
const WORDS = [
  w('One', 0, 0.3), w('two', 0.3, 0.6), w('three', 0.6, 0.9), w('four', 0.9, 1.2),
  w('five', 1.2, 1.5), w('six', 1.5, 1.8), w('seven', 1.8, 2.1), w('eight', 2.1, 2.4),
];
// What the engine groups these into (no cuts: composition time = source time).
const card = (id: string, from: number, to: number): CaptionCard => ({
  id,
  start: WORDS[from].start,
  end: WORDS[to].end,
  words: WORDS.slice(from, to + 1).map((x, k) => ({ index: from + k, text: x.text, start: x.start, end: x.end, emphasis: false })),
});
const C0 = card('w0', 0, 3);
const C1 = card('w4', 4, 7);
const SEGS: CompSegment[] = [{ start: 0, end: 4, compStart: 0, compEnd: 4 }];

function baseDoc(): EditDocument {
  return {
    version: 1,
    cuts: [{ id: 's1', start: 3, end: 3.5, reason: 'silence', accepted: true, confidence: 1 }],
    wordOverrides: [],
    captions: captionSettingsFromPreset('pop'),
    zoom: { mode: 'subtle', intensity: 2, faceFollow: true },
    crop: { auto916: true, aspect: '9:16' },
    audio: { mode: 'original' },
  };
}

const PID = 'caption-edits-test';
const doc = () => useLibrary.getState().docs[PID];
const past = () => useEditHistory.getState().past[PID]?.length ?? 0;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Commits `next`, checks it is exactly one history entry, then undoes and checks the document is back. */
function oneStep(check: Check, name: string, next: EditDocument | null | { doc: EditDocument } | { error: string }) {
  const before = doc();
  const n0 = past();
  const d = next && 'error' in next ? null : next && 'doc' in next ? next.doc : next;
  if (!d) {
    check(false, `${name}: produced an edit`);
    return null;
  }
  commitDoc(PID, d);
  check(past() === n0 + 1, `${name}: one history entry (${past() - n0})`);
  const after = doc();
  undoDoc(PID);
  check(same(doc(), before), `${name}: undo restores the document`);
  redoDoc(PID);
  check(same(doc(), after), `${name}: redo re-applies it`);
  undoDoc(PID);
  return after;
}

export function runCaptionEditTests(check: Check) {
  console.log('• caption edits: one undo step each');
  useLibrary.getState().setDoc(PID, baseDoc());
  useEditHistory.setState((h) => ({ past: { ...h.past, [PID]: [] }, future: { ...h.future, [PID]: [] } }));

  const split = oneStep(check, 'split', splitCaption(doc(), C0, C1, WORDS, 0.62));
  check(same(split?.captionEdits?.boundaries, [0.6, 1.2]), `split at "three", pinning "five" (${JSON.stringify(split?.captionEdits)})`);
  const oneWord = splitCaption(doc(), card('w3', 3, 3), C1, WORDS, 1);
  check('error' in oneWord, 'a one-word caption can’t be split');

  const merged = oneStep(check, 'merge', mergeCaption(doc(), C0, C1, WORDS));
  check(same(merged?.captionEdits, { merges: [1.2] }), `merge stores the joined boundary (${JSON.stringify(merged?.captionEdits)})`);
  check('error' in mergeCaption(doc(), C1, undefined, WORDS), 'the last caption has nothing to merge with');

  const hidden = oneStep(check, 'hide', setCaptionHidden(doc(), 'w4', true));
  check(same(hidden?.captionEdits, { hidden: ['w4'] }), 'hide stores the id');
  check(!setCaptionHidden(hidden!, 'w4', false).captionEdits, 'show removes it again (and empty edits disappear)');

  const retimed = oneStep(check, 'retime', retimeCaption(doc(), C1, SEGS, { start: 1.0 }));
  check(same(retimed?.captionEdits?.timing, [{ id: 'w4', start: 1.0 }]), `retime stores source seconds (${JSON.stringify(retimed?.captionEdits?.timing)})`);
  // With a cut before the caption, composition time maps back to source time.
  const cutSegs: CompSegment[] = [{ start: 0, end: 0.3, compStart: 0, compEnd: 0.3 }, { start: 0.6, end: 4, compStart: 0.3, compEnd: 3.7 }];
  const shifted = retimeCaption(doc(), C1, cutSegs, { end: 2.0 });
  check(Math.abs((shifted.captionEdits?.timing?.[0].end ?? 0) - 2.3) < 1e-9, 'retime converts composition → source');

  const typed = oneStep(check, 'edit text', editCaptionText(doc(), C0, 'Uno dos three cuatro', WORDS));
  check(
    same(typed?.wordOverrides, [{ wordIndex: 0, text: 'Uno' }, { wordIndex: 1, text: 'dos' }, { wordIndex: 3, text: 'cuatro' }]),
    `same word count: one override per changed word (${JSON.stringify(typed?.wordOverrides)})`,
  );
  const fewer = editCaptionText(doc(), C0, 'hello world', WORDS);
  check(same(fewer?.wordOverrides.map((o) => o.text), ['hello', '', 'world', '']), `fewer words spread over the slots, first slot kept (${JSON.stringify(fewer?.wordOverrides)})`);
  const more = editCaptionText(doc(), C0, 'a b c d e f', WORDS);
  check(same(more?.wordOverrides.map((o) => o.text), ['a', 'b c', 'd', 'e f']), `more words spread over the slots (${JSON.stringify(more?.wordOverrides)})`);
  check(editCaptionText(doc(), C0, 'One two three four', WORDS) === null, 'unchanged text is not an edit');
  check(same(editCaptionText(more!, C0, '  ', WORDS)?.wordOverrides, []), 'empty text restores the transcript');
  check(captionText(C0, more!, WORDS) === 'a b c d e f', 'the editor shows the typed text back');

  console.log('• reset caption edits vs revert to original');
  let d = withLook(baseDoc().captions, { background: 'box', outline: 'thick' });
  check(d.styleId === 'custom' && d.baseStyleId === 'pop' && presetById(d.styleId).name === 'Custom', 'changing the look marks the style custom');
  check(lookOf(d).background === 'box' && lookOf(d).animation === 'pop', 'custom keeps the base preset’s other defaults');
  const edited: EditDocument = { ...baseDoc(), captions: d, captionEdits: { hidden: ['w4'], merges: [1.2] } };
  useLibrary.getState().setDoc(PID, edited);
  const n0 = past();
  const reset = oneStep(check, 'reset caption edits', resetCaptionEdits(doc()));
  check(!!reset && reset.captionEdits === undefined && reset.captions.styleId === 'custom' && reset.captions.background === 'box', 'reset clears only caption edits');
  const reverted = oneStep(check, 'revert to original', revertToOriginal(doc()));
  check(!!reverted && reverted.captionEdits === undefined, 'revert clears caption edits');
  check(
    !!reverted && reverted.captions.styleId === 'pop' && reverted.captions.background === undefined && reverted.captions.outline === undefined && !reverted.captions.enabled,
    `revert clears style overrides and turns captions off (${JSON.stringify(reverted?.captions)})`,
  );
  check(!!reverted && reverted.cuts.length === 0 && reverted.zoom.mode === 'off', 'revert clears cuts and zoom');
  check(past() === n0, 'every step above was undone');
  d = captionSettingsFromPreset('boxed');
  check(lookOf(d).background === 'box' && lookOf(d).shadow === false, 'preset look defaults match the engine');

  console.log('• trimming a clip by its ends');
  useLibrary.getState().setDoc(PID, baseDoc());
  // Kept: 0–3 and 3.5–5 (duration 5) → composition 0–3 and 3–4.5.
  const segs: CompSegment[] = [{ start: 0, end: 3, compStart: 0, compEnd: 3 }, { start: 3.5, end: 5, compStart: 3, compEnd: 4.5 }];
  let n = 0;
  const id = (p: string) => `${p}${n++}`;
  const inward = oneStep(check, 'trim in', trimClip(doc(), segs, { start: 0, end: 3 }, 'end', -0.5, 5, id));
  const added = inward?.cuts.find((c) => c.reason === 'manual');
  check(!!added && Math.abs(added.start - 2.5) < 1e-9 && Math.abs(added.end - 3) < 1e-9, `dragging the end in cuts 2.5–3 (${JSON.stringify(added)})`);
  const outward = oneStep(check, 'trim out', trimClip(doc(), segs, { start: 3, end: 4.5 }, 'start', -0.2, 5, id));
  check(same(outward?.cuts.map((c) => [c.start, c.end]), [[3, 3.3]]), `dragging the start out gives 0.2 s back (${JSON.stringify(outward?.cuts)})`);
  const all = trimClip(doc(), segs, { start: 3, end: 4.5 }, 'start', -2, 5, id);
  check(!!all && all.cuts.length === 0, 'dragging past the whole cut removes it');
  check(trimClip(doc(), segs, { start: 0, end: 3 }, 'start', -1, 5, id) === null, 'nothing to restore before the first frame');
}
