// Edits to a clip's text overlays. Pure: each returns the next document, and the editor commits it with
// commitDoc (src/state/history.ts), so every change is one undo step.

import type { CompSegment, EditDocument, TextOverlay, TextOverlayStyle } from '@/engine/types';
import { clampSize, DEFAULT_SIZE, overlayWindow, styleDef } from './textLayout';

/** Shortest time an overlay can be retimed to, in seconds. */
export const MIN_OVERLAY_SEC = 0.3;
/** Edges this close to the clip's start / end snap to "whole clip". */
const EDGE_SNAP = 0.05;

export function newOverlay(id: string, style: TextOverlayStyle = 'classic', text = ''): TextOverlay {
  return { id, text, style, box: 'none', color: styleDef(style).color, align: 'center', size: DEFAULT_SIZE, x: 0.5, y: 0.5, rotation: 0 };
}

const withOverlays = (doc: EditDocument, list: TextOverlay[]): EditDocument => {
  const { textOverlays: _old, ...rest } = doc;
  return list.length ? { ...rest, textOverlays: list } : rest;
};

/**
 * Text as both renderers lay it out: each line trimmed, runs of spaces and tabs collapsed to one space
 * (the engine wraps on single spaces), trailing empty lines dropped.
 */
export function normalizeText(text: string) {
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t\u00A0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n+$/, '');
}

/** Adds the overlay, or replaces the one with its id. */
export function upsertOverlay(doc: EditDocument, o: TextOverlay): EditDocument {
  const list = doc.textOverlays ?? [];
  const next = { ...o, text: normalizeText(o.text), size: clampSize(o.size) };
  return withOverlays(doc, list.some((x) => x.id === o.id) ? list.map((x) => (x.id === o.id ? next : x)) : [...list, next]);
}

/** Null when nothing would change (so a no-op gesture isn't an undo step). */
export function updateOverlay(doc: EditDocument, id: string, patch: Partial<Omit<TextOverlay, 'id'>>): EditDocument | null {
  const list = doc.textOverlays ?? [];
  const cur = list.find((x) => x.id === id);
  if (!cur) return null;
  const next: TextOverlay = { ...cur, ...patch };
  if ('size' in patch) next.size = clampSize(next.size);
  if ('text' in patch) next.text = normalizeText(next.text);
  // "Whole clip" is stored as absent times.
  if (next.start === undefined) delete next.start;
  if (next.end === undefined) delete next.end;
  if (JSON.stringify(next) === JSON.stringify(cur)) return null;
  return withOverlays(doc, list.map((x) => (x.id === id ? next : x)));
}

export function removeOverlay(doc: EditDocument, id: string): EditDocument | null {
  const list = doc.textOverlays ?? [];
  if (!list.some((x) => x.id === id)) return null;
  return withOverlays(doc, list.filter((x) => x.id !== id));
}

export const isWholeClip = (o: TextOverlay) => o.start === undefined && o.end === undefined;

export function setWholeClip(doc: EditDocument, id: string) {
  return updateOverlay(doc, id, { start: undefined, end: undefined });
}

/**
 * Moves an overlay's start and/or end (output seconds). Clamped to the video and to MIN_OVERLAY_SEC;
 * an edge dragged to the clip's start or end means "from the start" / "to the end" (stored as absent).
 */
export function retimeOverlay(doc: EditDocument, id: string, edge: { start?: number; end?: number }, total: number) {
  const cur = doc.textOverlays?.find((x) => x.id === id);
  if (!cur) return null;
  let start = edge.start ?? cur.start ?? 0;
  let end = edge.end ?? cur.end ?? total;
  start = Math.max(0, Math.min(start, total - MIN_OVERLAY_SEC));
  end = Math.min(total, Math.max(end, start + MIN_OVERLAY_SEC));
  if (edge.start !== undefined) start = Math.min(start, end - MIN_OVERLAY_SEC);
  return updateOverlay(doc, id, {
    start: start <= EDGE_SNAP ? undefined : start,
    end: end >= total - EDGE_SNAP ? undefined : end,
  });
}

/**
 * The source clip's overlays copied onto every other clip in its batch (replacing theirs), with fresh ids.
 * Returns only the documents that change; the caller commits each (one undo step per clip).
 */
export function copyOverlaysToBatch(
  docs: Record<string, EditDocument | undefined>,
  sourceId: string,
  projectIds: string[],
  makeId: () => string,
): Record<string, EditDocument> {
  const src = docs[sourceId]?.textOverlays ?? [];
  const out: Record<string, EditDocument> = {};
  for (const pid of projectIds) {
    const d = docs[pid];
    if (pid === sourceId || !d) continue;
    out[pid] = withOverlays(d, src.map((o) => ({ ...o, id: makeId() })));
  }
  return out;
}

/** Output (composition) seconds → source seconds. */
export function outputToSource(segments: CompSegment[], t: number) {
  for (const s of segments) if (t <= s.compEnd) return s.start + Math.max(0, t - s.compStart);
  return segments.length ? segments[segments.length - 1].end : 0;
}

/**
 * The source footage an overlay sits over. Overlays are timed in output seconds, so cuts before an overlay
 * don't move it on the finished video; they change which source frames are under it.
 */
export function overlaySourceSpan(o: TextOverlay, segments: CompSegment[], total: number) {
  const w = overlayWindow(o, total);
  return { start: outputToSource(segments, w.start), end: outputToSource(segments, w.end) };
}
