import type { View } from 'react-native';

import type { Rect, TourTargetId } from './steps';

// Screens tag the views a tour points at; the tour host measures them in window coordinates.

const nodes = new Map<TourTargetId, View>();
const refs = new Map<TourTargetId, (node: View | null) => void>();

/** A stable callback ref for a tour target. Safe to call in JSX, including inside conditionals. */
export function tourTarget(id: TourTargetId): (node: View | null) => void {
  let ref = refs.get(id);
  if (!ref) {
    ref = (node: View | null) => {
      if (node) nodes.set(id, node);
      else nodes.delete(id);
    };
    refs.set(id, ref);
  }
  return ref;
}

/** Hook form of `tourTarget`: `<View ref={useTourTarget('setup.clips')}>`. */
export function useTourTarget(id: TourTargetId) {
  return tourTarget(id);
}

function measure(node: View): Promise<Rect | null> {
  return new Promise((resolve) => {
    try {
      node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
    } catch {
      resolve(null);
    }
  });
}

/** Rects of the given targets that are mounted and laid out. */
export async function measureTargets(ids: TourTargetId[]): Promise<Record<string, Rect>> {
  const out: Record<string, Rect> = {};
  await Promise.all(
    ids.map(async (id) => {
      const node = nodes.get(id);
      const r = node ? await measure(node) : null;
      if (r) out[id] = r;
    }),
  );
  return out;
}
