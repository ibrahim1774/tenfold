import type { Segment } from '@/mock/data';

// Source ↔ composition time through keep segments (JS mirror of the Swift TimeMapper, M0 only).

export type CompSegment = Segment & { compStart: number; compEnd: number };

export function layoutSegments(segments: Segment[]): CompSegment[] {
  let t = 0;
  return segments.map((s) => {
    const len = s.end - s.start;
    const out = { ...s, compStart: t, compEnd: t + len };
    t += len;
    return out;
  });
}

export function compDuration(segs: CompSegment[]): number {
  return segs.length ? segs[segs.length - 1].compEnd : 0;
}

export function toComp(segs: CompSegment[], source: number): number {
  for (const s of segs) {
    if (source < s.start) return s.compStart;
    if (source <= s.end) return s.compStart + (source - s.start);
  }
  return compDuration(segs);
}

export function toSource(segs: CompSegment[], comp: number): number {
  for (const s of segs) {
    if (comp <= s.compEnd) return s.start + Math.max(0, comp - s.compStart);
  }
  return segs.length ? segs[segs.length - 1].end : 0;
}
