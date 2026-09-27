// Edits to a clip's sound (EditDocument.audioClips). Pure: each returns the next document, and the editor
// commits it with commitDoc (src/state/history.ts), so every change is one undo step. The engine plays and
// exports the result in modules/tenfold-engine/ios/Engine/Core/AudioPlanner.swift (same rules).
//
// Rules
// - Times are OUTPUT seconds (after cuts), like text overlays.
// - A document without `audioClips` plays one original clip over the whole video (muted when
//   `audio.mode` is 'mute'). The first real edit materialises that clip (`audioClipsOf`); selecting
//   alone doesn't, so it isn't an undo step.
// - Original clips never overlap and never move. Splitting one at t gives [a, t] and [t, b]; deleting one
//   leaves silence there. The engine maps each through the cuts to source time.
// - File clips are sounds in the project folder. Moving the head (trim) moves `offset` with it, so the
//   sound stays anchored to the video; `end` trims the tail.
// - Changing cuts changes the output length (`syncAudioToCuts`, run by the editor on every commit):
//   clips are clamped to the new end, and an original clip (or looping sound) that reached the old end
//   follows it to the new end.

import type { AddedAudio, AudioClip, CompSegment, Cut, EditDocument } from '@/engine/types';

/** Shortest clip an edit can leave. */
export const MIN_AUDIO_SEC = 0.1;
export const MAX_VOLUME = 2;
export const MAX_FADE = 3;
export const FADE_STEP = 0.25;
/** Id of the original clip a document without audioClips plays. */
export const ORIGINAL_ID = 'original';
/** CutPlanner.minKeep: kept stretches shorter than this are dropped. */
const MIN_KEEP = 0.18;
/** An edge this close to the video's end counts as "at the end". */
const END_SNAP = 0.05;

export type AudioEdit = { doc: EditDocument } | { error: string };

// ---------- Output length (mirror of Swift CutPlanner.keepSegments / TimeMapper) ----------

/** Kept source ranges after the accepted cuts (Swift CutPlanner.keepSegments). */
export function keepSegments(cuts: Cut[], duration: number): { start: number; end: number }[] {
  const accepted = cuts.filter((c) => c.accepted && c.end > c.start).sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const c of accepted) {
    const r = { start: Math.max(0, c.start), end: Math.min(duration, c.end) };
    if (r.end <= r.start) continue;
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push(r);
  }
  const keep: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.start > cursor) keep.push({ start: cursor, end: m.start });
    cursor = Math.max(cursor, m.end);
  }
  if (duration > cursor) keep.push({ start: cursor, end: duration });
  const filtered = keep.filter((r) => r.end - r.start >= MIN_KEEP);
  return filtered.length === 0 && duration > 0 ? [{ start: 0, end: duration }] : filtered;
}

/** Keep segments with their composition times (Swift TimeMapper.segments). */
export function segmentsOf(cuts: Cut[], duration: number): CompSegment[] {
  let t = 0;
  return keepSegments(cuts, duration).map((r) => {
    const s = { start: r.start, end: r.end, compStart: t, compEnd: t + (r.end - r.start) };
    t = s.compEnd;
    return s;
  });
}

/** Output length for a set of cuts. */
export function outputDuration(cuts: Cut[], duration: number): number {
  const segs = segmentsOf(cuts, duration);
  return segs.length ? segs[segs.length - 1].compEnd : 0;
}

/** Where an original clip's sound comes from: its window intersected with each kept segment (source seconds). */
export function originalSourceRanges(clip: AudioClip, segments: CompSegment[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const s of segments) {
    const a = Math.max(clip.start, s.compStart);
    const b = Math.min(clip.end, s.compEnd);
    if (b - a > 1e-6) out.push({ start: s.start + (a - s.compStart), end: s.start + (b - s.compStart) });
  }
  return out;
}

// ---------- Reading ----------

export function originalClip(total: number): AudioClip {
  return { id: ORIGINAL_ID, source: 'original', start: 0, end: total, offset: 0, volume: 1, fadeIn: 0, fadeOut: 0 };
}

/** The clips as stored, or the one original clip a document without audioClips plays. */
export function audioClipsOf(doc: EditDocument, total: number): AudioClip[] {
  return doc.audioClips ?? [originalClip(total)];
}

const byStart = (a: AudioClip, b: AudioClip) => a.start - b.start;

export const originalsOf = (clips: AudioClip[]) => clips.filter((c) => c.source === 'original').sort(byStart);
export const filesOf = (clips: AudioClip[]) => clips.filter((c) => c.source === 'file').sort(byStart);

/** File clips in rows, so sounds that overlap in time don't cover each other. */
export function fileRows(clips: AudioClip[]): { rows: { clip: AudioClip; row: number }[]; count: number } {
  const rowEnds: number[] = [];
  const rows: { clip: AudioClip; row: number }[] = [];
  for (const clip of filesOf(clips)) {
    let row = rowEnds.findIndex((e) => e <= clip.start + 1e-6);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = clip.end;
    rows.push({ clip, row });
  }
  return { rows, count: rowEnds.length };
}

/** How much sound is left in the file after the clip's head (Infinity when unknown or looping). */
export function fileRemaining(clip: AudioClip): number {
  if (clip.source !== 'file' || clip.loop || !clip.fileDuration) return Infinity;
  return Math.max(0, clip.fileDuration - clip.offset);
}

/** A sound that stops before the video does and could loop to fill it. */
export function canLoopToFit(clip: AudioClip, total: number): boolean {
  return clip.source === 'file' && !clip.loop && fileRemaining(clip) < Infinity && clip.end < total - END_SNAP && clip.end >= clip.start + fileRemaining(clip) - END_SNAP;
}

/** Every added sound file a document uses. */
export function referencedFiles(docs: (EditDocument | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const d of docs) for (const c of d?.audioClips ?? []) if (c.file) out.add(c.file);
  return out;
}

/** "Voiceover 3": one more than the voiceovers already on the clip. */
export function nextVoiceoverTitle(doc: EditDocument): string {
  const n = (doc.audioClips ?? []).filter((c) => /^Voiceover \d+$/.test(c.title ?? '')).length;
  return `Voiceover ${n + 1}`;
}

// ---------- Edits ----------

const round = (v: number, step = 1e-3) => Math.round(v / step) * step;

function withClips(doc: EditDocument, clips: AudioClip[]): EditDocument {
  return { ...doc, audioClips: [...originalsOf(clips), ...filesOf(clips)] };
}

/** Replaces one clip (materialising the original first). Null when nothing changes. */
function patchClip(doc: EditDocument, id: string, total: number, patch: (c: AudioClip) => AudioClip): EditDocument | null {
  const clips = audioClipsOf(doc, total);
  const cur = clips.find((c) => c.id === id);
  if (!cur) return null;
  const next = patch(cur);
  if (JSON.stringify(next) === JSON.stringify(cur)) return null;
  return withClips(doc, clips.map((c) => (c.id === id ? next : c)));
}

/** Splits the clip at output time `t`. The second half gets a new id; fades stay at the outer ends. */
export function splitAudioClip(doc: EditDocument, id: string, t: number, total: number, makeId: () => string): AudioEdit {
  const clips = audioClipsOf(doc, total);
  const cur = clips.find((c) => c.id === id);
  if (!cur) return { error: 'That sound is gone.' };
  if (t <= cur.start + MIN_AUDIO_SEC || t >= cur.end - MIN_AUDIO_SEC) {
    return { error: 'Can’t split here. Move the playhead inside the sound, away from its ends.' };
  }
  const first: AudioClip = { ...cur, end: t, fadeOut: 0 };
  let offset = cur.offset + (t - cur.start);
  if (cur.source === 'original') offset = 0;
  else if (cur.loop && cur.fileDuration) offset %= cur.fileDuration;
  const second: AudioClip = { ...cur, id: makeId(), start: t, offset: round(offset, 1e-4), fadeIn: 0 };
  return { doc: withClips(doc, [...clips.filter((c) => c.id !== id), first, second]) };
}

/** Removes the clip. For the original sound this leaves silence there. */
export function deleteAudioClip(doc: EditDocument, id: string, total: number): EditDocument | null {
  const clips = audioClipsOf(doc, total);
  if (!clips.some((c) => c.id === id)) return null;
  return withClips(doc, clips.filter((c) => c.id !== id));
}

export function setClipVolume(doc: EditDocument, id: string, volume: number, total: number) {
  const v = round(Math.min(MAX_VOLUME, Math.max(0, Number.isFinite(volume) ? volume : 1)), 0.01);
  return patchClip(doc, id, total, (c) => ({ ...c, volume: v }));
}

/** Fades are 0–3 s in 0.25 s steps, and never longer together than the clip. */
export function setClipFades(doc: EditDocument, id: string, fades: { fadeIn?: number; fadeOut?: number }, total: number) {
  return patchClip(doc, id, total, (c) => {
    const len = c.end - c.start;
    const clamp = (v: number) => Math.min(MAX_FADE, Math.max(0, round(v, FADE_STEP)));
    let fadeIn = clamp(fades.fadeIn ?? c.fadeIn);
    let fadeOut = clamp(fades.fadeOut ?? c.fadeOut);
    if (fadeIn + fadeOut > len) {
      if (fades.fadeIn !== undefined) fadeIn = Math.max(0, len - fadeOut);
      else fadeOut = Math.max(0, len - fadeIn);
    }
    return { ...c, fadeIn, fadeOut };
  });
}

/**
 * Loop on: the sound repeats; if it was playing to the end of the file, it now fills to the end of the
 * video ("Loop to fit"). Loop off: it stops where the file runs out again.
 */
export function setClipLoop(doc: EditDocument, id: string, on: boolean, total: number) {
  return patchClip(doc, id, total, (c) => {
    if (c.source !== 'file') return c;
    if (on) {
      const toFileEnd = !c.fileDuration || c.end >= c.start + (c.fileDuration - c.offset) - END_SNAP;
      return { ...c, loop: true, end: toFileEnd ? total : c.end };
    }
    const { loop: _loop, ...rest } = c;
    const offset = c.fileDuration ? c.offset % c.fileDuration : c.offset;
    const end = c.fileDuration ? Math.min(c.end, c.start + (c.fileDuration - offset)) : c.end;
    return { ...rest, offset, end };
  });
}

export function setClipDucking(doc: EditDocument, id: string, on: boolean, total: number) {
  return patchClip(doc, id, total, (c) => (c.source === 'file' ? { ...c, ducking: on } : c));
}

/** Neighbouring original clips: how far an original clip's edges can go. */
function originalBounds(clips: AudioClip[], cur: AudioClip, total: number) {
  const others = originalsOf(clips).filter((c) => c.id !== cur.id);
  const prevEnd = Math.max(0, ...others.filter((c) => c.end <= cur.start + 1e-6).map((c) => c.end));
  const nextStart = Math.min(total, ...others.filter((c) => c.start >= cur.end - 1e-6).map((c) => c.start));
  return { prevEnd, nextStart };
}

/** How far each edge of a clip can be dragged (output seconds), for the timeline's handles. */
export function trimLimits(clips: AudioClip[], cur: AudioClip, total: number) {
  const len = cur.end - cur.start;
  const shrink = Math.max(0, len - MIN_AUDIO_SEC);
  if (cur.source === 'original') {
    const { prevEnd, nextStart } = originalBounds(clips, cur, total);
    return { start: [prevEnd - cur.start, shrink] as const, end: [-shrink, nextStart - cur.end] as const };
  }
  // A file's head can come back only as far as the sound it skipped (anywhere when looping).
  const back = cur.loop ? cur.start : Math.min(cur.start, cur.offset);
  const tail = Math.min(total, cur.start + fileRemaining(cur)) - cur.end;
  return { start: [-back, shrink] as const, end: [-shrink, Math.max(0, tail)] as const };
}

/**
 * Moves a clip's start and/or end (output seconds), clamped by trimLimits. Moving a file clip's start
 * moves its offset too, so the sound under the rest of the clip doesn't shift.
 */
export function trimAudioClip(doc: EditDocument, id: string, edge: { start?: number; end?: number }, total: number) {
  const clips = audioClipsOf(doc, total);
  const cur = clips.find((c) => c.id === id);
  if (!cur) return null;
  const lim = trimLimits(clips, cur, total);
  const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
  const ds = edge.start === undefined ? 0 : clamp(edge.start - cur.start, lim.start);
  const de = edge.end === undefined ? 0 : clamp(edge.end - cur.end, lim.end);
  return patchClip(doc, id, total, (c) => {
    const start = round(c.start + ds, 1e-4);
    const end = round(c.end + de, 1e-4);
    if (c.source === 'original') return { ...c, start, end };
    let offset = c.offset + (start - c.start);
    if (c.loop && c.fileDuration) offset = ((offset % c.fileDuration) + c.fileDuration) % c.fileDuration;
    return { ...c, start, end, offset: round(Math.max(0, offset), 1e-4) };
  });
}

/** Moves an added sound along the video (original sound can't move). Keeps its length inside the video. */
export function moveAudioClip(doc: EditDocument, id: string, start: number, total: number) {
  return patchClip(doc, id, total, (c) => {
    if (c.source !== 'file') return c;
    const len = Math.min(c.end - c.start, total);
    const s = round(Math.min(Math.max(0, start), total - len), 1e-4);
    return { ...c, start: s, end: round(s + len, 1e-4) };
  });
}

/**
 * Adds a sound at the playhead: it plays to its own end or the video's end, whichever is first (longer
 * music is trimmed; shorter sound can "Loop to fit" later). Volume 100%, no fades.
 */
export function addFileClip(
  doc: EditDocument,
  added: AddedAudio,
  at: number,
  total: number,
  opts: { id: string; ducking: boolean; title?: string },
): AudioEdit {
  if (!added.file || !added.durationSec) return { error: 'This sound couldn’t be added.' };
  const start = round(Math.max(0, Math.min(at, total)), 1e-4);
  const end = round(Math.min(total, start + added.durationSec), 1e-4);
  if (end - start < MIN_AUDIO_SEC) return { error: 'Move the playhead back from the end to add a sound there.' };
  const clip: AudioClip = {
    id: opts.id,
    source: 'file',
    file: added.file,
    title: opts.title ?? added.title ?? 'Sound',
    start,
    end,
    offset: 0,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    ducking: opts.ducking,
    fileDuration: added.durationSec,
  };
  return { doc: withClips(doc, [...audioClipsOf(doc, total), clip]) };
}

/** Mute switch: the original sound, all of it (added sounds keep playing). */
export function setOriginalMuted(doc: EditDocument, muted: boolean): EditDocument {
  return { ...doc, audio: { mode: muted ? 'mute' : 'original' } };
}

/**
 * Keeps the sound in step with a change of cuts (the editor runs this inside every commit, so it is part of
 * the same undo step). Clips are clamped to the new length; an original clip or a looping sound that reached
 * the old end follows it to the new end. Clips left with nothing are dropped.
 */
export function syncAudioToCuts(prev: EditDocument | undefined, next: EditDocument, sourceDuration: number): EditDocument {
  if (!next.audioClips || !prev || prev.cuts === next.cuts || !(sourceDuration > 0)) return next;
  const oldTotal = outputDuration(prev.cuts, sourceDuration);
  const newTotal = outputDuration(next.cuts, sourceDuration);
  if (Math.abs(oldTotal - newTotal) < 1e-6) return next;
  const clips: AudioClip[] = [];
  for (const c of next.audioClips) {
    const follows = c.end >= oldTotal - END_SNAP && (c.source === 'original' || c.loop);
    const end = Math.min(newTotal, follows ? newTotal : c.end);
    if (end - c.start >= MIN_AUDIO_SEC) clips.push({ ...c, end: round(end, 1e-4) });
  }
  return { ...next, audioClips: clips };
}

/** "Re-apply Tenfold's edit": added sounds stay (they're the user's); the original returns whole. */
export function keepAddedSounds(fresh: EditDocument, current: EditDocument, sourceDuration: number): EditDocument {
  const files = filesOf(current.audioClips ?? []);
  if (!files.length) return fresh;
  const total = outputDuration(fresh.cuts, sourceDuration);
  const kept = files
    .map((c) => ({ ...c, end: Math.min(c.end, total) }))
    .filter((c) => c.end - c.start >= MIN_AUDIO_SEC);
  return { ...fresh, audioClips: [originalClip(total), ...kept] };
}
