import type { CaptionCard, CaptionEdits, CompSegment, EditDocument, Word } from '../engine/types';
import { withoutLook } from './presets';

// Pure edits to caption groups (EditDocument.captionEdits / wordOverrides). The editor commits the
// results with commitDoc, so each one is a single undo step. The engine applies them in
// modules/tenfold-engine/ios/Engine/Core/CaptionGrouper.swift.
//
// Group ids are "w" + the transcript index of the group's first word. Boundaries and merges are stored
// as the source start time of the word a group starts with, so they survive cuts and re-grouping.

/** Shortest a caption can be retimed to (CaptionGrouper.minRetimeSec). */
export const MIN_CAPTION_SEC = 0.3;
const EPS = 0.002;

export type EditResult = { doc: EditDocument } | { error: string };

const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const without = (list: number[] | undefined, t: number) => (list ?? []).filter((x) => !near(x, t));
const withTime = (list: number[] | undefined, t: number) => [...without(list, t), t].sort((a, b) => a - b);

/** Drops empty lists; no edits at all → the key is removed. */
function withEdits(doc: EditDocument, e: CaptionEdits): EditDocument {
  const clean: CaptionEdits = {};
  if (e.boundaries?.length) clean.boundaries = e.boundaries;
  if (e.merges?.length) clean.merges = e.merges;
  if (e.hidden?.length) clean.hidden = e.hidden;
  if (e.timing?.length) clean.timing = e.timing;
  const { captionEdits: _old, ...rest } = doc;
  return Object.keys(clean).length ? { ...rest, captionEdits: clean } : rest;
}

const editsOf = (doc: EditDocument): CaptionEdits => doc.captionEdits ?? {};

/** Source start of a group's first word (where a boundary or merge for it is stored). */
export function groupStart(card: CaptionCard, words: Word[]): number {
  const w = card.words[0];
  return words[w.index]?.start ?? w.start;
}

/** Composition → source time. */
export function compToSource(segments: CompSegment[], comp: number): number {
  for (const s of segments) if (comp <= s.compEnd) return s.start + Math.max(0, comp - s.compStart);
  return segments.length ? segments[segments.length - 1].end : comp;
}

/** Text shown in the inline editor: the user's spelling or the transcript's, never uppercased. */
export function captionText(card: CaptionCard, doc: EditDocument, words: Word[]): string {
  const o = new Map(doc.wordOverrides.map((x) => [x.wordIndex, x.text]));
  return card.words
    .map((w) => o.get(w.index) ?? words[w.index]?.text ?? w.text)
    .filter((t) => t.trim() !== '')
    .join(' ');
}

/**
 * Splits a group at the word boundary nearest the playhead. The group's old end is pinned too, so the
 * groups after it keep their words (word-count grouping would otherwise re-flow them) and their ids.
 */
export function splitCaption(doc: EditDocument, card: CaptionCard, next: CaptionCard | undefined, words: Word[], playhead: number): EditResult {
  if (card.words.length < 2) return { error: 'Can’t split a one-word caption.' };
  let k = 1;
  for (let i = 2; i < card.words.length; i++) {
    if (Math.abs(card.words[i].start - playhead) < Math.abs(card.words[k].start - playhead)) k = i;
  }
  const at = words[card.words[k].index]?.start ?? card.words[k].start;
  const e = editsOf(doc);
  let boundaries = withTime(e.boundaries, at);
  let merges = without(e.merges, at);
  if (next) {
    const pin = groupStart(next, words);
    boundaries = withTime(boundaries, pin);
    merges = without(merges, pin);
  }
  // A retimed end belonged to the whole group; the first half ends where its words end.
  const timing = (e.timing ?? []).map((t) => (t.id === card.id ? { id: t.id, start: t.start } : t)).filter((t) => t.start != null || t.end != null);
  return { doc: withEdits(doc, { ...e, boundaries, merges, timing }) };
}

/** Joins a group with the next one. The joined group keeps the first id; the second's hide/retime go. */
export function mergeCaption(doc: EditDocument, card: CaptionCard, next: CaptionCard | undefined, words: Word[]): EditResult {
  if (!next) return { error: 'This is the last caption, so there’s nothing to merge it with.' };
  const at = groupStart(next, words);
  const e = editsOf(doc);
  const timing = (e.timing ?? [])
    .filter((t) => t.id !== next.id)
    .map((t) => (t.id === card.id ? { id: t.id, start: t.start } : t))
    .filter((t) => t.start != null || t.end != null);
  return {
    doc: withEdits(doc, {
      ...e,
      merges: withTime(e.merges, at),
      boundaries: without(e.boundaries, at),
      hidden: (e.hidden ?? []).filter((id) => id !== next.id),
      timing,
    }),
  };
}

export function setCaptionHidden(doc: EditDocument, id: string, hidden: boolean): EditDocument {
  const e = editsOf(doc);
  const rest = (e.hidden ?? []).filter((x) => x !== id);
  return withEdits(doc, { ...e, hidden: hidden ? [...rest, id] : rest });
}

/**
 * Moves a group's start and/or end (composition seconds in, stored as source seconds). The engine
 * clamps to the neighbours and to MIN_CAPTION_SEC; the timeline clamps the same way while dragging.
 */
export function retimeCaption(doc: EditDocument, card: CaptionCard, segments: CompSegment[], edge: { start?: number; end?: number }): EditDocument {
  const e = editsOf(doc);
  const old = (e.timing ?? []).find((t) => t.id === card.id);
  const entry = {
    id: card.id,
    start: edge.start != null ? compToSource(segments, edge.start) : old?.start,
    end: edge.end != null ? compToSource(segments, edge.end) : old?.end,
  };
  return withEdits(doc, { ...e, timing: [...(e.timing ?? []).filter((t) => t.id !== card.id), entry] });
}

/**
 * Replaces the text of a group, written as per-word overrides so word timing is kept.
 * - Same number of words: each word gets its new spelling.
 * - Different number: the new words are spread evenly over the group's word slots, in order. More words
 *   than slots → some slots hold two or more words; fewer → trailing slots in each stretch are left empty
 *   (the engine skips empty words). The first slot always gets a word, so the group keeps its id.
 * - Empty text restores the transcript's words.
 * Returns null when nothing changes (no undo step).
 */
export function editCaptionText(doc: EditDocument, card: CaptionCard, text: string, words: Word[]): EditDocument | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const slots = card.words.map((w) => w.index);
  const m = slots.length;
  const n = tokens.length;
  const texts: string[] = new Array(m).fill('');
  if (n === 0) {
    for (let k = 0; k < m; k++) texts[k] = words[slots[k]]?.text ?? '';
  } else if (n >= m) {
    for (let k = 0; k < m; k++) texts[k] = tokens.slice(Math.floor((k * n) / m), Math.floor(((k + 1) * n) / m)).join(' ');
  } else {
    for (let j = 0; j < n; j++) {
      const k = Math.floor((j * m) / n);
      texts[k] = texts[k] ? `${texts[k]} ${tokens[j]}` : tokens[j];
    }
  }
  const byIndex = new Map(doc.wordOverrides.map((o) => [o.wordIndex, o.text]));
  let changed = false;
  slots.forEach((idx, k) => {
    const original = words[idx]?.text;
    const next = texts[k] === original ? undefined : texts[k];
    if (byIndex.get(idx) !== next) changed = true;
    if (next == null) byIndex.delete(idx);
    else byIndex.set(idx, next);
  });
  if (!changed) return null;
  const wordOverrides = [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([wordIndex, t]) => ({ wordIndex, text: t }));
  return { ...doc, wordOverrides };
}

/** Clears split / merge / hide / retime; keeps the caption style and spelling fixes. */
export function resetCaptionEdits(doc: EditDocument): EditDocument {
  const { captionEdits: _edits, ...rest } = doc;
  return rest;
}

/** Back to the untouched clip: no cuts, captions off (preset look, no caption edits), no text, no zoom or reframing. */
export function revertToOriginal(doc: EditDocument): EditDocument {
  // Added sounds go too; their files stay in the project folder (undo brings them back) until the
  // project is deleted. Clip trims go (they are cuts); the clips and their order stay.
  const { captionEdits: _edits, textOverlays: _texts, audioClips: _audio, clipTrims: _trims, ...rest } = doc;
  return {
    ...rest,
    cuts: [],
    captions: { ...withoutLook(doc.captions), enabled: false },
    zoom: { ...doc.zoom, mode: 'off' },
    crop: { auto916: false, aspect: 'original', scale: 1, offsetX: 0, offsetY: 0 },
    audio: { mode: 'original' },
    splits: [],
    levels: { silence: 'off', fillers: 'off' },
  };
}
