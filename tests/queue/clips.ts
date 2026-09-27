// Multi-clip projects: add / reorder / trim / delete are one undo step each; reorder and delete remap cuts,
// splits and spelling fixes and clear caption edits; overlays and sounds are clamped; the output length is
// the sum of kept ranges; the export gets clipOrder / clipTrims; a video without clips behaves as before.
import {
  appendClips,
  clipsOf,
  cutsOfClips,
  deleteClip,
  effectiveCuts,
  layoutOf,
  moveClip,
  orderOf,
  outputTotalOf,
  placeThumbs,
  setClipTrim,
  sourceDurationOf,
  timelineClipsOf,
  trimClipByDrag,
  trimCutsOf,
  withAddedClips,
} from '@/editor/clips';
import { outputDuration, segmentsOf } from '@/editor/audioClips';
import { captionSettingsFromPreset } from '@/captions/presets';
import type { Cut, EditDocument, Project, ProjectClip } from '../../src/engine/types';
import { commitDoc, pinClipOrder, redoDoc, undoDoc, useEditHistory } from '@/state/history';
import { useLibrary } from '@/state/library';

type Check = (c: boolean, m: string) => void;

const PID = 'clips-test';
const doc = () => useLibrary.getState().docs[PID];
const past = () => useEditHistory.getState().past[PID]?.length ?? 0;
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const media = (d: number) => ({ durationSec: d, width: 1080, height: 1920, fps: 30, isHDR: false, hasAudio: true });
const cut = (id: string, start: number, end: number, reason: Cut['reason'] = 'silence'): Cut => ({ id, start, end, reason, accepted: true, confidence: 1 });

// A legacy one-clip video of 10 s.
const legacy: Pick<Project, 'clips' | 'title' | 'media' | 'posterUri'> = { title: 'Talk', media: media(10), posterUri: 'file:///p.jpg' };

function baseDoc(): EditDocument {
  return {
    version: 1,
    cuts: [cut('s1', 2, 3)],
    wordOverrides: [{ wordIndex: 1, text: 'Tenfold' }],
    captions: captionSettingsFromPreset('pop'),
    zoom: { mode: 'off', intensity: 2, faceFollow: true },
    crop: { auto916: true, aspect: '9:16' },
    audio: { mode: 'original' },
    splits: [6],
    captionEdits: { hidden: ['w0'] },
    textOverlays: [{ id: 't', text: 'End card', style: 'classic', box: 'none', color: '#FFFFFF', align: 'center', size: 0.07, x: 0.5, y: 0.5, rotation: 0, start: 12, end: 15 }],
    audioClips: [{ id: 'original', source: 'original', start: 0, end: 9, offset: 0, volume: 1, fadeIn: 0, fadeOut: 0 }],
  };
}

function step(check: Check, name: string, next: EditDocument | null | { doc: EditDocument } | { error: string }) {
  const d = next && 'error' in next ? null : next && 'doc' in next && !('version' in next) ? next.doc : (next as EditDocument | null);
  if (!d) {
    check(false, `${name}: produced an edit${next && 'error' in next ? ` (${next.error})` : ''}`);
    return null;
  }
  const n0 = past();
  commitDoc(PID, d);
  check(past() === n0 + 1, `${name}: one history entry (${past() - n0})`);
  return doc();
}

export function runClipTests(check: Check) {
  console.log('• clips: a video without clips behaves as before');
  const one = clipsOf(legacy);
  check(one.length === 1 && one[0].id === 'c0' && one[0].durationSec === 10, 'one legacy clip "c0" of the whole video');
  const d0 = baseDoc();
  check(orderOf(d0, one).join() === 'c0' && d0.clipOrder === undefined, 'no clip order needed');
  check(effectiveCuts(d0, one) === d0.cuts, 'no trims: the cuts are the document’s own');
  check(near(outputTotalOf(d0, one), outputDuration(d0.cuts, 10)) && near(outputTotalOf(d0, one), 9), `output length as before (${outputTotalOf(d0, one)})`);

  console.log('• clips: add at the end is one undo step; nothing is cleared');
  useLibrary.getState().setDoc(PID, d0);
  useEditHistory.setState((h) => ({ past: { ...h.past, [PID]: [d0] }, future: { ...h.future, [PID]: [] } }));
  // Pin the order first, so undo can take the new clip out (a document without an order plays every clip).
  pinClipOrder(PID, orderOf(doc(), one));
  check(doc().clipOrder?.join() === 'c0' && useEditHistory.getState().past[PID][0].clipOrder?.join() === 'c0' && past() === 1, 'order pinned in the document and its history, no new step');
  const k1: ProjectClip = { id: 'k1', title: 'Second', durationSec: 5, media: media(5) };
  const clips = withAddedClips(legacy, [k1]);
  check(clips.map((c) => c.id).join() === 'c0,k1' && clips[0].durationSec === 10, 'the one-clip video becomes c0 + k1');
  check(near(sourceDurationOf(doc(), clips), 10), 'until committed, the new clip doesn’t play');
  // What the engine suggests for the new clip (ids prefixed with its id, times on the joined timeline).
  const analysis = { cuts: [cut('s1', 2, 3), cut('k1/s0.500', 10.5, 11)], clips: [{ id: 'c0', title: '', start: 0, end: 10, wordStart: 0, wordCount: 4 }, { id: 'k1', title: '', start: 10, end: 15, wordStart: 4, wordCount: 3 }] };
  const newCuts = cutsOfClips(analysis, ['k1']);
  check(newCuts.length === 1 && newCuts[0].id === 'k1/s0.500', 'the new clip’s suggestions');
  const added = step(check, 'add a clip', appendClips(doc(), clips, ['k1'], newCuts));
  check(added?.clipOrder?.join() === 'c0,k1', 'appended to the play order');
  check(near(sourceDurationOf(added!, clips), 15), `sum of durations: 10 + 5 = ${sourceDurationOf(added!, clips)}`);
  check(near(outputTotalOf(added!, clips), 13.5), `output = sum of kept ranges (${outputTotalOf(added!, clips)})`);
  check(!!added?.captionEdits && added.wordOverrides[0].wordIndex === 1 && added.splits?.join() === '6', 'caption edits, spelling fixes and splits kept');
  check(added?.audioClips?.[0].end === 13.5, `the original sound runs on into the new clip (${added?.audioClips?.[0].end})`);
  undoDoc(PID);
  check(doc().clipOrder?.join() === 'c0' && doc().cuts.length === 1, 'undo takes the clip out again');
  redoDoc(PID);
  check(doc().clipOrder?.join() === 'c0,k1', 'redo brings it back');

  console.log('• clips: reorder is one undo step; cuts, splits and spelling fixes follow their clips');
  const counts = { c0: 4, k1: 3 };
  const withCross = step(check, 'a cut across the boundary', { ...doc(), cuts: [...doc().cuts, cut('x', 9.5, 10.2, 'manual')], wordOverrides: [...doc().wordOverrides, { wordIndex: 5, text: 'again' }] });
  const moved = step(check, 'move k1 first', moveClip(withCross!, clips, 'k1', 0, counts));
  check(moved?.clipOrder?.join() === 'k1,c0', 'new play order');
  check(moved?.captionEdits === undefined, 'caption edits cleared (word indices changed)');
  check(moved?.splits?.length === 1 && near(moved.splits[0], 11), `split follows c0: 6 → 11 (${moved?.splits})`);
  const byId = (id: string) => moved?.cuts.find((c) => c.id === id);
  check(!!byId('s1') && near(byId('s1')!.start, 7) && near(byId('s1')!.end, 8), 'c0’s cut moved by 5 s');
  check(!!byId('k1/s0.500') && near(byId('k1/s0.500')!.start, 0.5), 'k1’s cut moved to the start');
  check(!!byId('x') && !!byId('x~1') && near(byId('x')!.start, 14.5) && near(byId('x')!.end, 15) && near(byId('x~1')!.start, 0) && near(byId('x~1')!.end, 0.2), 'the cross-boundary cut is split, one piece per clip');
  check(moved?.wordOverrides.find((o) => o.text === 'Tenfold')?.wordIndex === 4 && moved?.wordOverrides.find((o) => o.text === 'again')?.wordIndex === 1, `spelling fixes renumbered (${JSON.stringify(moved?.wordOverrides)})`);
  check(near(outputTotalOf(moved!, clips), outputTotalOf(withCross!, clips)), 'same length after a reorder');
  check(moveClip(moved!, clips, 'k1', 0, counts) === null, 'moving to the same place is no edit');
  undoDoc(PID);
  check(doc().clipOrder?.join() === 'c0,k1' && !!doc().captionEdits, 'undo restores order and caption edits');

  console.log('• clips: trims are one undo step, planned as manual cuts, never stored as cuts');
  const nCuts = doc().cuts.length;
  const trimmed = step(check, 'trim 1 s off k1’s head', setClipTrim(doc(), clips, 'k1', { head: 1 }));
  check(trimmed?.clipTrims?.[0].clipId === 'k1' && trimmed.clipTrims[0].head === 1 && trimmed.cuts.length === nCuts, 'stored as a trim');
  const tc = trimCutsOf(trimmed!, layoutOf(trimmed!, clips));
  check(tc.length === 1 && tc[0].reason === 'manual' && near(tc[0].start, 10) && near(tc[0].end, 11), 'a manual cut at k1’s head');
  check(near(outputTotalOf(trimmed!, clips), outputTotalOf(doc(), clips)), 'the document’s length includes the trim');
  const segs = segmentsOf(effectiveCuts(trimmed!, clips), sourceDurationOf(trimmed!, clips));
  const tl = timelineClipsOf(layoutOf(trimmed!, clips), segs);
  check(tl.length === 2 && near(tl[1].start, tl[0].end), 'on the timeline k1 starts where c0 ends');
  const dragged = trimClipByDrag(trimmed!, clips, segs, 'k1', 'end', -1);
  check(!!dragged && near(dragged.clipTrims!.find((t) => t.clipId === 'k1')!.tail, 1, 1e-3), 'dragging the end in by 1 s trims 1 s off the tail');
  const back = trimClipByDrag(trimmed!, clips, segs, 'k1', 'start', -3);
  check(!!back && !back.clipTrims, 'dragging the head out past its trim gives it all back');
  check(setClipTrim(trimmed!, clips, 'k1', { head: 99 })!.clipTrims![0].head === 4.8, 'at least 0.2 s of a clip stays');
  undoDoc(PID);
  check(doc().clipTrims === undefined, 'undo removes the trim');

  console.log('• clips: delete is one undo step; overlays and sound are clamped');
  const beforeDelete = doc();
  const del = deleteClip(doc(), clips, 'k1', counts);
  const gone = step(check, 'delete k1', del);
  check(gone?.clipOrder?.join() === 'c0' && !gone.cuts.some((c) => c.id.startsWith('k1/')), 'k1 and its cuts leave the video');
  const total = outputTotalOf(gone!, clips);
  check(near(total, 8.5), `length back to c0 alone, minus its cuts (${total})`);
  const t = gone?.textOverlays?.[0];
  check(!!t && t.start! <= total - 0.3 + 1e-9 && t.end! <= total + 1e-9, `text overlay clamped to the new end (${t?.start}–${t?.end})`);
  check((gone?.audioClips ?? []).every((c) => c.end <= total + 1e-9) && near(gone!.audioClips![0].end, total), 'the original sound ends with the video');
  check(gone?.captionEdits === undefined && gone!.wordOverrides.every((o) => o.wordIndex < 4), 'caption edits cleared, k1’s spelling fix dropped');
  const only = deleteClip(gone!, clips, 'c0', counts);
  check('error' in only, 'the last clip can’t be deleted');
  undoDoc(PID);
  check(JSON.stringify(doc()) === JSON.stringify(beforeDelete), 'undo restores the deleted clip exactly');

  console.log('• clips: filmstrip frames follow their clips');
  const frames = [
    { time: 1, uri: 'a', clipId: 'c0', clipTime: 1 },
    { time: 11, uri: 'b', clipId: 'k1', clipTime: 1 },
  ];
  const placed = placeThumbs(frames, layoutOf({ clipOrder: ['k1', 'c0'] }, clips));
  check(placed.find((f) => f.uri === 'b')?.time === 1 && placed.find((f) => f.uri === 'a')?.time === 6, 'reordered frames re-placed');
  check(placeThumbs(frames, layoutOf({ clipOrder: ['c0'] }, clips)).length === 1, 'a deleted clip’s frames are hidden');
  check(placeThumbs([{ time: 3, uri: 'old' }], layoutOf({}, one))[0].time === 3, 'frames from older builds are used as they are');
}
