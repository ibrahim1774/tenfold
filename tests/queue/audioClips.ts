// Audio lanes: materialise the original, each edit one undo step, originals never overlap, file offset
// maths, loop, revert, output-time mapping across a cut, cut changes keep the sound in step.
import { revertToOriginal } from '@/captions/edits';
import { captionSettingsFromPreset } from '@/captions/presets';
import {
  addFileClip,
  audioClipsOf,
  canLoopToFit,
  deleteAudioClip,
  fileRows,
  keepAddedSounds,
  keepSegments,
  moveAudioClip,
  nextVoiceoverTitle,
  originalsOf,
  originalSourceRanges,
  outputDuration,
  referencedFiles,
  segmentsOf,
  setClipDucking,
  setClipFades,
  setClipLoop,
  setClipVolume,
  splitAudioClip,
  syncAudioToCuts,
  trimAudioClip,
  trimLimits,
  type AudioEdit,
} from '@/editor/audioClips';
import type { AudioClip, Cut, EditDocument } from '../../src/engine/types';
import { commitDoc, undoDoc, useEditHistory } from '@/state/history';
import { useLibrary } from '@/state/library';

type Check = (c: boolean, m: string) => void;

const PID = 'audio-clip-test';
const doc = () => useLibrary.getState().docs[PID];
const past = () => useEditHistory.getState().past[PID]?.length ?? 0;
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const TOTAL = 10;

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

function step(check: Check, name: string, next: EditDocument | AudioEdit | null): EditDocument | null {
  const d = next && 'error' in next ? null : next && 'doc' in next ? next.doc : next;
  if (!d) {
    check(false, `${name}: produced an edit${next && 'error' in next ? ` (${next.error})` : ''}`);
    return null;
  }
  const n0 = past();
  commitDoc(PID, d);
  check(past() === n0 + 1, `${name}: one history entry (${past() - n0})`);
  return doc();
}

const clip = (d: EditDocument | null, id: string) => d?.audioClips?.find((c) => c.id === id);
const noOverlap = (clips: AudioClip[]) => {
  const o = originalsOf(clips);
  return o.every((c, i) => i === 0 || c.start >= o[i - 1].end - 1e-9);
};

export function runAudioClipTests(check: Check) {
  console.log('• audio: an untouched document plays one original clip; the first edit materialises it');
  useLibrary.getState().setDoc(PID, baseDoc());
  useEditHistory.setState((h) => ({ past: { ...h.past, [PID]: [] }, future: { ...h.future, [PID]: [] } }));
  const implicit = audioClipsOf(doc(), TOTAL);
  check(implicit.length === 1 && implicit[0].source === 'original' && implicit[0].start === 0 && implicit[0].end === TOTAL, 'one original over the whole video');
  check(doc().audioClips === undefined, 'reading does not change the document');

  console.log('• audio: split / delete / trim / volume / fade are one undo step each');
  let k = 0;
  const makeId = () => `a${k++}`;
  const split = step(check, 'split original at 4 s', splitAudioClip(doc(), 'original', 4, TOTAL, makeId));
  check(split?.audioClips?.length === 2 && clip(split, 'original')?.end === 4 && clip(split, 'a0')?.start === 4 && clip(split, 'a0')?.end === TOTAL, 'two originals [0,4] and [4,10]');
  const split2 = step(check, 'split again at 7 s', splitAudioClip(doc(), 'a0', 7, TOTAL, makeId));
  check(originalsOf(split2?.audioClips ?? []).map((c) => `${c.start}-${c.end}`).join() === '0-4,4-7,7-10', 'three originals');
  const removed = step(check, 'delete the middle', deleteAudioClip(doc(), 'a0', TOTAL));
  check(originalsOf(removed?.audioClips ?? []).map((c) => `${c.start}-${c.end}`).join() === '0-4,7-10', 'silence from 4 to 7 s');
  check(!!removed?.audio && removed.audio.mode === 'original', 'deleting part of the original is not a mute');
  const vol = step(check, 'volume', setClipVolume(doc(), 'original', 1.55, TOTAL));
  check(clip(vol, 'original')?.volume === 1.55, 'volume 155%');
  check(clip(setClipVolume(doc(), 'original', 9, TOTAL), 'original')?.volume === 2, 'volume capped at 200%');
  check(setClipVolume(doc(), 'original', 1.55, TOTAL) === null, 'same volume is not an edit');
  const faded = step(check, 'fade', setClipFades(doc(), 'original', { fadeIn: 0.6, fadeOut: 5 }, TOTAL));
  check(clip(faded, 'original')?.fadeIn === 0.5 && clip(faded, 'original')?.fadeOut === 3, `fades in 0.25 s steps, at most 3 s (${clip(faded, 'original')?.fadeIn}, ${clip(faded, 'original')?.fadeOut})`);
  const tight = setClipFades(setClipFades(doc(), 'a1', { fadeIn: 2 }, TOTAL)!, 'a1', { fadeOut: 2 }, TOTAL);
  check(clip(tight, 'a1')?.fadeIn === 2 && clip(tight, 'a1')?.fadeOut === 1, `fades never longer together than the 3 s clip (${clip(tight, 'a1')?.fadeOut})`);
  // Original edges stop at their neighbours: [0,4] can grow to 7 (the gap) but not past the [7,10] clip.
  const grown = step(check, 'trim original end outward', trimAudioClip(doc(), 'original', { end: 9 }, TOTAL));
  check(clip(grown, 'original')?.end === 7 && noOverlap(grown?.audioClips ?? []), `stops at the next original (${clip(grown, 'original')?.end})`);
  const lim = trimLimits(doc().audioClips!, clip(doc(), 'a1')!, TOTAL);
  check(near(lim.start[0], 0) && near(lim.end[1], 0), `a clip boxed in by neighbours can't grow (${JSON.stringify(lim)})`);
  check(moveAudioClip(doc(), 'original', 2, TOTAL) === null, 'original sound can’t move');
  const n = past();
  undoDoc(PID);
  check(clip(doc(), 'original')?.end === 4 && past() === n - 1, 'undo restores the trim');

  console.log('• audio: added sounds (offset maths, move, loop, ducking)');
  useLibrary.getState().setDoc(PID, baseDoc());
  const added = step(
    check,
    'add music at 2 s',
    addFileClip(doc(), { file: 'audio/m.m4a', title: 'Song', durationSec: 30 }, 2, TOTAL, { id: 'm', ducking: true }),
  );
  const m = clip(added, 'm');
  check(m?.start === 2 && m.end === TOTAL && m.offset === 0 && m.volume === 1 && m.ducking === true && m.fadeIn === 0, 'at the playhead, trimmed to the video, ducking on');
  check(added?.audioClips?.some((c) => c.source === 'original' && c.end === TOTAL) === true, 'the original is materialised next to it');
  const head = step(check, 'trim the head right by 1.5 s', trimAudioClip(doc(), 'm', { start: 3.5 }, TOTAL));
  check(clip(head, 'm')?.start === 3.5 && clip(head, 'm')?.offset === 1.5, `offset follows the head (${clip(head, 'm')?.offset})`);
  const back = trimAudioClip(doc(), 'm', { start: 0 }, TOTAL);
  check(!!back && 'audioClips' in back && clip(back, 'm')?.start === 2 && clip(back, 'm')?.offset === 0, 'the head comes back only as far as the skipped sound');
  const moved = step(check, 'move', moveAudioClip(doc(), 'm', 1, TOTAL));
  check(clip(moved, 'm')?.start === 1 && clip(moved, 'm')?.end === 7.5 && clip(moved, 'm')?.offset === 1.5, 'moving keeps length and offset');
  check(clip(moveAudioClip(doc(), 'm', 8, TOTAL), 'm')?.end === TOTAL, 'moving stops at the end of the video');
  const duck = step(check, 'ducking off', setClipDucking(doc(), 'm', false, TOTAL));
  check(clip(duck, 'm')?.ducking === false, 'ducking off');

  const vo = step(
    check,
    'add a 3 s voiceover at 5 s',
    addFileClip(doc(), { file: 'audio/v.m4a', durationSec: 3 }, 5, TOTAL, { id: 'v', ducking: false, title: nextVoiceoverTitle(doc()) }),
  );
  check(clip(vo, 'v')?.title === 'Voiceover 1' && clip(vo, 'v')?.end === 8 && clip(vo, 'v')?.ducking === false, 'voiceover: named, own length, no ducking');
  check(nextVoiceoverTitle(doc()) === 'Voiceover 2', 'next voiceover is number 2');
  const rows = fileRows(doc().audioClips!);
  check(rows.count === 2 && rows.rows.find((r) => r.clip.id === 'v')?.row === 1, 'overlapping sounds sit on separate rows');
  check(canLoopToFit(clip(doc(), 'v')!, TOTAL), 'a sound shorter than the rest of the video offers Loop to fit');
  const tailLim = trimLimits(doc().audioClips!, clip(doc(), 'v')!, TOTAL);
  check(near(tailLim.end[1], 0), 'its end can’t be dragged past the end of the file');
  const looped = step(check, 'loop to fit', setClipLoop(doc(), 'v', true, TOTAL));
  check(clip(looped, 'v')?.loop === true && clip(looped, 'v')?.end === TOTAL, 'loops to the end of the video');
  check(!canLoopToFit(clip(doc(), 'v')!, TOTAL), 'no Loop to fit once looping');
  const splitLoop = splitAudioClip(doc(), 'v', 9, TOTAL, () => 'v2');
  check('doc' in splitLoop && clip(splitLoop.doc, 'v2')?.offset === 1, 'splitting a loop in its second pass starts part-way through the file');
  const unlooped = step(check, 'loop off', setClipLoop(doc(), 'v', false, TOTAL));
  check(clip(unlooped, 'v')?.loop === undefined && clip(unlooped, 'v')?.end === 8, 'loop off: stops where the file ends');
  check(referencedFiles([doc()]).size === 2, 'two sound files referenced');
  const atEnd = addFileClip(doc(), { file: 'audio/x.m4a', durationSec: 3 }, TOTAL, TOTAL, { id: 'x', ducking: true });
  check('error' in atEnd, 'no sound can start at the very end');
  check(splitAudioClip(doc(), 'v', 5.05, TOTAL, makeId).hasOwnProperty('error'), 'split too close to an end is refused');

  console.log('• audio: revert to original clears the sound edits; re-apply keeps added sounds');
  const reverted = revertToOriginal(doc());
  check(reverted.audioClips === undefined && reverted.audio.mode === 'original', 'revert clears audio clips');
  const r = step(check, 'revert', reverted);
  undoDoc(PID);
  check(!!r && doc().audioClips?.length === 3, 'undo of revert restores them');
  const fresh: EditDocument = { ...baseDoc(), cuts: [{ id: 'c', start: 2, end: 4, reason: 'silence', accepted: true, confidence: 1 }] };
  const re = keepAddedSounds(fresh, doc(), TOTAL);
  check(originalsOf(re.audioClips!).length === 1 && originalsOf(re.audioClips!)[0].end === 8 && clip(re, 'm')?.end === 7.5, 'original whole again (8 s), added sounds kept');

  console.log('• audio: output time across a cut (same numbers as CoreTests)');
  const cuts: Cut[] = [{ id: 'c', start: 2, end: 3, reason: 'manual', accepted: true, confidence: 1 }];
  const segs = segmentsOf(cuts, 6);
  const ranges = originalSourceRanges({ ...audioClipsOf(baseDoc(), 5)[0], start: 1.5, end: 3 }, segs);
  check(ranges.length === 2 && near(ranges[0].start, 1.5) && near(ranges[0].end, 2) && near(ranges[1].start, 3) && near(ranges[1].end, 4), `output 1.5–3 = source 1.5–2 + 3–4 (${JSON.stringify(ranges)})`);
  check(near(outputDuration(cuts, 6), 5), 'output is 5 s');
  const sliver = keepSegments([{ id: 's', start: 0.1, end: 5.9, reason: 'silence', accepted: true, confidence: 1 }], 6);
  check(sliver.length === 1 && near(sliver[0].start, 0) && near(sliver[0].end, 6), 'slivers dropped, nothing left = whole clip (CutPlanner parity)');

  console.log('• audio: changing cuts keeps the sound in step');
  const withAudio: EditDocument = {
    ...baseDoc(),
    audioClips: [
      { id: 'o1', source: 'original', start: 0, end: 3, offset: 0, volume: 1, fadeIn: 0, fadeOut: 0 },
      { id: 'o2', source: 'original', start: 5, end: 10, offset: 0, volume: 1, fadeIn: 0, fadeOut: 0 },
      { id: 'f', source: 'file', file: 'audio/f.m4a', start: 6, end: 9.5, offset: 0, volume: 1, fadeIn: 0, fadeOut: 0 },
      { id: 'late', source: 'file', file: 'audio/g.m4a', start: 8.5, end: 9.5, offset: 0, volume: 1, fadeIn: 0, fadeOut: 0 },
    ],
  };
  const shorter = { ...withAudio, cuts: [{ id: 'c', start: 1, end: 3, reason: 'manual' as const, accepted: true, confidence: 1 }] };
  const synced = syncAudioToCuts(withAudio, shorter, TOTAL);
  check(clip(synced, 'o2')?.end === 8 && clip(synced, 'f')?.end === 8 && !clip(synced, 'late'), `clamped to the new 8 s; nothing-left clips dropped (${JSON.stringify(synced.audioClips?.map((c) => [c.id, c.end]))})`);
  const longer = syncAudioToCuts(shorter, { ...synced, cuts: [] }, TOTAL);
  check(clip(longer, 'o2')?.end === TOTAL && clip(longer, 'f')?.end === 8, 'the original that reached the end follows it back; the sound keeps its own end');
  const same = { ...withAudio };
  check(syncAudioToCuts(withAudio, same, TOTAL) === same, 'no cut change: untouched');
  const untouched = syncAudioToCuts(baseDoc(), { ...baseDoc(), cuts: shorter.cuts }, TOTAL);
  check(untouched.audioClips === undefined, 'documents without audio clips stay that way');
}
