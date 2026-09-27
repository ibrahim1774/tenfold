import type { CompSegment, Cut, EditDocument } from '../engine/types';

// Trimming a selected clip on the timeline by dragging its ends (pure; the editor commits the result).
// Inward drags cut the dragged-over part (a manual cut). Outward drags at an edge that borders a cut
// give removed footage back by shortening the cuts there. Everything is in source seconds.

/** A clip on the timeline (composition seconds). */
export type TrimRegion = { start: number; end: number };

/** Shortest a clip can be trimmed to. */
export const MIN_CLIP_SEC = 0.2;

function segmentOf(segments: CompSegment[], r: TrimRegion) {
  const mid = (r.start + r.end) / 2;
  return segments.find((s) => mid >= s.compStart && mid <= s.compEnd);
}

/** Removed footage just outside the edge (source seconds), i.e. how far an outward drag can go. */
export function restorableSec(segments: CompSegment[], r: TrimRegion, side: 'start' | 'end', duration: number): number {
  const seg = segmentOf(segments, r);
  if (!seg) return 0;
  // Only an edge that is a segment edge borders a cut (splits sit inside kept footage).
  if (side === 'start' && Math.abs(r.start - seg.compStart) > 1e-3) return 0;
  if (side === 'end' && Math.abs(r.end - seg.compEnd) > 1e-3) return 0;
  const i = segments.indexOf(seg);
  if (side === 'start') return seg.start - (i > 0 ? segments[i - 1].end : 0);
  return (i + 1 < segments.length ? segments[i + 1].start : duration) - seg.end;
}

/** Gives [a, b] back: accepted cuts overlapping it are shortened or split around it. */
export function restoreRange(cuts: Cut[], a: number, b: number, newId: (prefix: string) => string): Cut[] {
  const out: Cut[] = [];
  for (const c of cuts) {
    if (!c.accepted || c.end <= a || c.start >= b) {
      out.push(c);
      continue;
    }
    if (a - c.start > 0.02) out.push({ ...c, end: a });
    if (c.end - b > 0.02) out.push({ ...c, id: a - c.start > 0.02 ? newId('r') : c.id, start: b });
  }
  return out;
}

/**
 * The edit for dragging one end of a clip by `delta` composition seconds (positive = to the right).
 * Returns null when nothing would change.
 */
export function trimClip(
  doc: EditDocument,
  segments: CompSegment[],
  r: TrimRegion,
  side: 'start' | 'end',
  delta: number,
  duration: number,
  newId: (prefix: string) => string,
): EditDocument | null {
  const seg = segmentOf(segments, r);
  if (!seg || Math.abs(delta) < 0.02) return null;
  const srcStart = seg.start + (r.start - seg.compStart);
  const srcEnd = seg.start + (r.end - seg.compStart);
  const inward = side === 'start' ? delta > 0 : delta < 0;
  if (inward) {
    const d = Math.min(Math.abs(delta), r.end - r.start - MIN_CLIP_SEC);
    if (d < 0.02) return null;
    const cut: Cut =
      side === 'start'
        ? { id: newId('t'), start: srcStart, end: srcStart + d, reason: 'manual', accepted: true, confidence: 1 }
        : { id: newId('t'), start: srcEnd - d, end: srcEnd, reason: 'manual', accepted: true, confidence: 1 };
    return { ...doc, cuts: [...doc.cuts, cut] };
  }
  const d = Math.min(Math.abs(delta), restorableSec(segments, r, side, duration));
  if (d < 0.02) return null;
  const [a, b] = side === 'start' ? [Math.max(0, srcStart - d), srcStart] : [srcEnd, Math.min(duration, srcEnd + d)];
  return { ...doc, cuts: restoreRange(doc.cuts, a, b, newId) };
}
