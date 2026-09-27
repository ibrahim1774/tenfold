// Multi-clip projects: the "+" at the end of the timeline, reorder, trim and delete of whole clips. Pure: each
// edit returns the next document and the editor commits it with commitDoc (src/state/history.ts), so every
// change is one undo step. Mirrors modules/tenfold-engine/ios/Engine/Core/ClipTimeline.swift.
//
// Model
// - A video is its clips played one after another. The project SOURCE timeline is the clips in play order
//   (EditDocument.clipOrder; absent = every clip in the order added), concatenated: clip k starts where
//   clip k-1 ends. Cuts, splits, caption boundaries and word times all live on this timeline, so every
//   existing edit keeps working unchanged.
// - Adding a clip appends it to the end: nothing before it moves, nothing is cleared.
// - Reordering or deleting moves every later clip on the timeline. Cuts and splits are remapped clip by clip
//   (a cut across a clip boundary is split at it). Word indices (caption ids "w<index>", spelling fixes)
//   are positions in the concatenated transcript: spelling fixes are renumbered by the clips' word counts,
//   and caption edits (split / merge / hide / retime, keyed by those ids) are cleared.
// - Trims are stored per clip (clipTrims: seconds off the head and tail) and planned as manual cuts
//   (trimCutsOf, same rule as the engine), never stored as cuts.
// - Text overlays and sounds are in OUTPUT time: they stay where they are, clamped to the new length.
// - A deleted clip only leaves `clipOrder`; its file stays until the video is deleted, so undo restores it.

import type { AddedClip, Analysis, ClipTrim, CompSegment, Cut, EditDocument, Project, ProjectClip, Thumbnail } from '@/engine/types';
import { outputDuration, syncAudioToLength } from './audioClips';
import { MIN_OVERLAY_SEC } from './textOverlays';

/** Id of the one clip of a video imported before multi-clip projects (ClipTimeline.legacyClipId). */
export const LEGACY_CLIP_ID = 'c0';
/** Shortest a clip can be trimmed to (ClipTimeline.minClipSec). */
export const MIN_CLIP_SEC = 0.2;

export type ClipEdit = { doc: EditDocument } | { error: string };

/** A clip on the project source timeline (seconds). */
export type PlacedClip = { clip: ProjectClip; start: number; end: number };

/** A video's clips in the order added; a video without `clips` is one clip. */
export function clipsOf(project: Pick<Project, 'clips' | 'title' | 'media' | 'posterUri'>): ProjectClip[] {
  if (project.clips?.length) return project.clips;
  return [{ id: LEGACY_CLIP_ID, title: project.title, durationSec: project.media?.durationSec ?? 0, posterUri: project.posterUri, media: project.media }];
}

/** Clip ids in play order (ClipTimeline.ordered): known ids, first occurrence; never empty when there are clips. */
export function orderOf(doc: Pick<EditDocument, 'clipOrder'>, clips: ProjectClip[]): string[] {
  if (!doc.clipOrder) return clips.map((c) => c.id);
  const known = new Set(clips.map((c) => c.id));
  const out: string[] = [];
  for (const id of doc.clipOrder) if (known.has(id) && !out.includes(id)) out.push(id);
  return out.length || !clips.length ? out : [clips[0].id];
}

/** The clips in play order with their place on the source timeline. */
export function layoutOf(doc: Pick<EditDocument, 'clipOrder'>, clips: ProjectClip[]): PlacedClip[] {
  const byId = new Map(clips.map((c) => [c.id, c]));
  let t = 0;
  const out: PlacedClip[] = [];
  for (const id of orderOf(doc, clips)) {
    const clip = byId.get(id);
    if (!clip) continue;
    const d = Math.max(0, clip.durationSec);
    out.push({ clip, start: t, end: t + d });
    t += d;
  }
  return out;
}

/** Length of the source timeline: the clips that play, end to end. */
export function sourceDurationOf(doc: Pick<EditDocument, 'clipOrder'>, clips: ProjectClip[]): number {
  const l = layoutOf(doc, clips);
  return l.length ? l[l.length - 1].end : 0;
}

/** A trim's head and tail, clamped so at least MIN_CLIP_SEC of the clip stays (ClipTimeline.clamped). */
export function clampTrim(t: Pick<ClipTrim, 'head' | 'tail'>, length: number): { head: number; tail: number } {
  const room = Math.max(0, length - MIN_CLIP_SEC);
  const head = Math.min(room, Math.max(0, Number.isFinite(t.head) ? t.head : 0));
  const tail = Math.min(room - head, Math.max(0, Number.isFinite(t.tail) ? t.tail : 0));
  return { head, tail };
}

/** The document's clip trims as accepted manual cuts (ClipTimeline.trimCuts). */
export function trimCutsOf(doc: Pick<EditDocument, 'clipTrims'>, layout: PlacedClip[]): Cut[] {
  const out: Cut[] = [];
  for (const t of doc.clipTrims ?? []) {
    const s = layout.find((p) => p.clip.id === t.clipId);
    if (!s) continue;
    const { head, tail } = clampTrim(t, s.end - s.start);
    if (head > 0.001) out.push({ id: `trim:${t.clipId}:head`, start: s.start, end: s.start + head, reason: 'manual', accepted: true, confidence: 1 });
    if (tail > 0.001) out.push({ id: `trim:${t.clipId}:tail`, start: s.end - tail, end: s.end, reason: 'manual', accepted: true, confidence: 1 });
  }
  return out;
}

/** Every cut the engine plans with: the document's plus the clip trims. */
export function effectiveCuts(doc: EditDocument, clips: ProjectClip[]): Cut[] {
  const extra = trimCutsOf(doc, layoutOf(doc, clips));
  return extra.length ? [...doc.cuts, ...extra] : doc.cuts;
}

/** Output length of a document: the sum of the kept ranges across its clips. */
export function outputTotalOf(doc: EditDocument, clips: ProjectClip[]): number {
  return outputDuration(effectiveCuts(doc, clips), sourceDurationOf(doc, clips));
}

/** The trim stored for a clip (0 / 0 when none). */
export function trimOf(doc: Pick<EditDocument, 'clipTrims'>, clipId: string): { head: number; tail: number } {
  const t = doc.clipTrims?.find((x) => x.clipId === clipId);
  return { head: t?.head ?? 0, tail: t?.tail ?? 0 };
}

/** Words per clip, from an analysis in any order (its `clips` spans). */
export function wordCountsOf(analysis: Pick<Analysis, 'clips'> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of analysis?.clips ?? []) out[s.id] = s.wordCount;
  return out;
}

/** Composition → source seconds (the engine's TimeMapper.toSource). */
export function compToSourceTime(segments: CompSegment[], comp: number): number {
  for (const s of segments) if (comp <= s.compEnd) return s.start + Math.max(0, comp - s.compStart);
  return segments.length ? segments[segments.length - 1].end : 0;
}

/** Source → composition seconds (TimeMapper.toComp): a time inside a cut snaps to the next kept frame. */
export function sourceToCompTime(segments: CompSegment[], source: number): number {
  for (const s of segments) {
    if (source < s.start) return s.compStart;
    if (source <= s.end) return s.compStart + (source - s.start);
  }
  return segments.length ? segments[segments.length - 1].compEnd : 0;
}

/** A clip on the timeline strip, in composition seconds. */
export type TimelineClip = { id: string; title: string; start: number; end: number };

/** Where each playing clip shows on the timeline (composition seconds); clips cut away entirely are left out. */
export function timelineClipsOf(layout: PlacedClip[], segments: CompSegment[]): TimelineClip[] {
  const out: TimelineClip[] = [];
  for (const p of layout) {
    const start = sourceToCompTime(segments, p.start);
    const end = sourceToCompTime(segments, p.end);
    if (end - start > 0.01) out.push({ id: p.clip.id, title: p.clip.title, start, end });
  }
  return out;
}

/** Filmstrip frames placed on the current order's source timeline (frames of clips not playing are dropped). */
export function placeThumbs(thumbs: Thumbnail[], layout: PlacedClip[]): Thumbnail[] {
  if (!thumbs.some((t) => t.clipId)) return thumbs;
  const starts = new Map(layout.map((p) => [p.clip.id, p.start]));
  const out: Thumbnail[] = [];
  for (const t of thumbs) {
    const at = t.clipId ? starts.get(t.clipId) : undefined;
    if (at === undefined || t.clipTime === undefined) continue;
    out.push({ ...t, time: at + t.clipTime });
  }
  return out;
}

// ---------- Remapping between orders ----------

function clampOverlays(doc: EditDocument, total: number): EditDocument {
  if (!doc.textOverlays?.length || !(total > 0)) return doc;
  const list = doc.textOverlays.map((o) => {
    if (o.start === undefined && o.end === undefined) return o;
    const start = o.start === undefined ? undefined : Math.max(0, Math.min(o.start, total - MIN_OVERLAY_SEC));
    const end = o.end === undefined ? undefined : Math.min(total, Math.max(o.end, (start ?? 0) + MIN_OVERLAY_SEC));
    return start === o.start && end === o.end ? o : { ...o, start, end };
  });
  return { ...doc, textOverlays: list };
}

/**
 * The document with its clips in `order`: cuts, splits and spelling fixes follow their clips; caption edits
 * are cleared when any clip moves or goes (word indices change); overlays and sounds are clamped.
 */
export function withOrder(doc: EditDocument, clips: ProjectClip[], order: string[], wordCounts: Record<string, number>): EditDocument {
  const before = layoutOf(doc, clips);
  const draft: EditDocument = { ...doc, clipOrder: order };
  const after = layoutOf(draft, clips);
  const newStart = new Map(after.map((p) => [p.clip.id, p.start]));

  // Cuts, clip by clip; a cut across a boundary becomes one piece per clip.
  const cuts: Cut[] = [];
  for (const c of doc.cuts) {
    let n = 0;
    for (const p of before) {
      const a = Math.max(c.start, p.start);
      const b = Math.min(c.end, p.end);
      const at = newStart.get(p.clip.id);
      if (b - a <= 1e-6 || at === undefined) continue;
      cuts.push({ ...c, id: n === 0 ? c.id : `${c.id}~${n}`, start: at + (a - p.start), end: at + (b - p.start) });
      n++;
    }
  }
  cuts.sort((x, y) => x.start - y.start);

  const splits: number[] = [];
  for (const t of doc.splits ?? []) {
    const p = before.find((q) => t >= q.start && t < q.end);
    const at = p ? newStart.get(p.clip.id) : undefined;
    if (p && at !== undefined) splits.push(at + (t - p.start));
  }
  splits.sort((x, y) => x - y);

  // Spelling fixes follow their words.
  const firstWord = (layout: PlacedClip[]) => {
    const m = new Map<string, number>();
    let i = 0;
    for (const p of layout) {
      m.set(p.clip.id, i);
      i += wordCounts[p.clip.id] ?? 0;
    }
    return m;
  };
  const oldFirst = firstWord(before);
  const newFirst = firstWord(after);
  const wordOverrides: EditDocument['wordOverrides'] = [];
  for (const o of doc.wordOverrides) {
    const p = before.find((q) => {
      const f = oldFirst.get(q.clip.id) ?? 0;
      return o.wordIndex >= f && o.wordIndex < f + (wordCounts[q.clip.id] ?? 0);
    });
    const to = p ? newFirst.get(p.clip.id) : undefined;
    if (p && to !== undefined) wordOverrides.push({ ...o, wordIndex: to + (o.wordIndex - (oldFirst.get(p.clip.id) ?? 0)) });
  }

  // Appending keeps every index; any other change renumbers the words, so caption edits go.
  const oldIds = before.map((p) => p.clip.id);
  const appended = oldIds.every((id, i) => after[i]?.clip.id === id);
  const kept = new Set(after.map((p) => p.clip.id));
  const trims = (doc.clipTrims ?? []).filter((t) => kept.has(t.clipId));

  const { captionEdits: _edits, clipTrims: _trims, splits: _splits, ...rest } = doc;
  let next: EditDocument = { ...rest, cuts, wordOverrides, clipOrder: order };
  if (splits.length || doc.splits) next.splits = splits;
  if (appended && doc.captionEdits) next.captionEdits = doc.captionEdits;
  if (trims.length) next.clipTrims = trims;

  const oldTotal = outputTotalOf(doc, clips);
  const newTotal = outputTotalOf(next, clips);
  next = clampOverlays(syncAudioToLength(next, oldTotal, newTotal), newTotal);
  return next;
}

/**
 * Clips just added (already in `clips`, analysed) join the end of the play order, with the cuts Tenfold
 * suggested for them. One undo step; undo takes them out of the order again.
 */
export function appendClips(doc: EditDocument, clips: ProjectClip[], newIds: string[], newCuts: Cut[]): EditDocument | null {
  const known = new Set(clips.map((c) => c.id));
  const ids = newIds.filter((id) => known.has(id));
  if (!ids.length) return null;
  const current = orderOf(doc, clips).filter((id) => !ids.includes(id));
  const order = [...current, ...ids.filter((id) => !current.includes(id))];
  const prev: EditDocument = { ...doc, clipOrder: current };
  const next: EditDocument = { ...doc, clipOrder: order, cuts: [...doc.cuts, ...newCuts] };
  return syncAudioToLength(next, outputTotalOf(prev, clips), outputTotalOf(next, clips));
}

/** Suggested cuts for these clips in an analysis (the engine prefixes a clip's cut ids with its id). */
export function cutsOfClips(analysis: Pick<Analysis, 'cuts' | 'clips'>, ids: string[]): Cut[] {
  const spans = (analysis.clips ?? []).filter((s) => ids.includes(s.id));
  return analysis.cuts.filter((c) => spans.some((s) => c.id.startsWith(`${s.id}/`) || (c.start >= s.start - 1e-6 && c.end <= s.end + 1e-6)));
}

/** Moves a clip to position `to` in the play order. Null when nothing changes. */
export function moveClip(doc: EditDocument, clips: ProjectClip[], id: string, to: number, wordCounts: Record<string, number>): EditDocument | null {
  const order = orderOf(doc, clips);
  const from = order.indexOf(id);
  if (from < 0) return null;
  const rest = order.filter((x) => x !== id);
  const at = Math.max(0, Math.min(rest.length, to));
  const next = [...rest.slice(0, at), id, ...rest.slice(at)];
  if (next.every((x, i) => x === order[i])) return null;
  return withOrder(doc, clips, next, wordCounts);
}

/** Takes a clip out of the video (its file stays for undo). The last clip can't be deleted. */
export function deleteClip(doc: EditDocument, clips: ProjectClip[], id: string, wordCounts: Record<string, number>): ClipEdit {
  const order = orderOf(doc, clips);
  if (!order.includes(id)) return { error: 'This clip isn’t in the video.' };
  if (order.length <= 1) return { error: 'Can’t delete the only clip. Add another clip first.' };
  return { doc: withOrder(doc, clips, order.filter((x) => x !== id), wordCounts) };
}

/** Sets a clip's trim (seconds off its head and/or tail), clamped. Null when nothing changes. */
export function setClipTrim(doc: EditDocument, clips: ProjectClip[], id: string, patch: { head?: number; tail?: number }): EditDocument | null {
  const span = layoutOf(doc, clips).find((p) => p.clip.id === id);
  if (!span) return null;
  const cur = trimOf(doc, id);
  const want = clampTrim({ head: patch.head ?? cur.head, tail: patch.tail ?? cur.tail }, span.end - span.start);
  const head = Math.round(want.head * 1000) / 1000;
  const tail = Math.round(want.tail * 1000) / 1000;
  if (Math.abs(head - cur.head) < 0.01 && Math.abs(tail - cur.tail) < 0.01) return null;
  const others = (doc.clipTrims ?? []).filter((t) => t.clipId !== id);
  const trims = head > 0 || tail > 0 ? [...others, { clipId: id, head, tail }] : others;
  const { clipTrims: _old, ...rest } = doc;
  let next: EditDocument = trims.length ? { ...rest, clipTrims: trims } : rest;
  const newTotal = outputTotalOf(next, clips);
  next = clampOverlays(syncAudioToLength(next, outputTotalOf(doc, clips), newTotal), newTotal);
  return next;
}

/**
 * The trim for dragging one end of a clip on the timeline by `delta` composition seconds (+ = right).
 * Inward drags trim what was dragged over (through the cut plan, so cuts inside the clip count as they
 * show); outward drags give trimmed footage back.
 */
export function trimClipByDrag(
  doc: EditDocument,
  clips: ProjectClip[],
  segments: CompSegment[],
  id: string,
  side: 'start' | 'end',
  delta: number,
): EditDocument | null {
  const span = layoutOf(doc, clips).find((p) => p.clip.id === id);
  if (!span || Math.abs(delta) < 0.02) return null;
  const cur = trimOf(doc, id);
  if (side === 'start') {
    if (delta > 0) {
      const compStart = sourceToCompTime(segments, span.start + cur.head);
      return setClipTrim(doc, clips, id, { head: compToSourceTime(segments, compStart + delta) - span.start });
    }
    return setClipTrim(doc, clips, id, { head: Math.max(0, cur.head + delta) });
  }
  if (delta < 0) {
    const compEnd = sourceToCompTime(segments, span.end - cur.tail);
    return setClipTrim(doc, clips, id, { tail: span.end - compToSourceTime(segments, compEnd + delta) });
  }
  return setClipTrim(doc, clips, id, { tail: Math.max(0, cur.tail - delta) });
}

/** Clips added by the engine, as the video's clip records (failed ones left out). */
export function projectClipsFrom(added: AddedClip[]): ProjectClip[] {
  const out: ProjectClip[] = [];
  for (const a of added) {
    if (a.error || !a.id || !a.media) continue;
    out.push({ id: a.id, title: cleanClipTitle(a.title), durationSec: a.media.durationSec, posterUri: a.posterUri ?? null, media: a.media });
  }
  return out;
}

/** "IMG_0042.MOV" → "Clip 0042"; empty → "Clip". */
export function cleanClipTitle(title: string | undefined): string {
  const t = (title ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/^IMG_/, 'Clip ').trim();
  return t.length ? t : 'Clip';
}

/** A video's clips after adding some: a one-clip video first becomes clip "c0" with its own length. */
export function withAddedClips(project: Pick<Project, 'clips' | 'title' | 'media' | 'posterUri'>, added: ProjectClip[]): ProjectClip[] {
  const have = clipsOf(project);
  return [...have, ...added.filter((a) => !have.some((c) => c.id === a.id))];
}

/** How many clips a video plays (its document's order; every clip before it has one). */
export function playingClipCount(project: Pick<Project, 'clips' | 'title' | 'media' | 'posterUri'>, doc: Pick<EditDocument, 'clipOrder'> | undefined): number {
  return orderOf(doc ?? {}, clipsOf(project)).length;
}

/** Length of the footage a video plays (its clips in order), for cards and summaries. */
export function playingSeconds(project: Pick<Project, 'clips' | 'title' | 'media' | 'posterUri'>, doc: Pick<EditDocument, 'clipOrder'> | undefined): number {
  return doc ? sourceDurationOf(doc, clipsOf(project)) : (project.media?.durationSec ?? 0);
}
