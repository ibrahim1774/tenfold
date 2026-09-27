import { create } from 'zustand';

import type { AddedClip } from '@/engine/types';

// The camera screen adds a recording to a video (Engine.addClip) and hands it back to the editor, which
// analyses it and puts it at the end of the timeline as one undo step.

type Bus = { pending: { projectId: string; added: AddedClip } | null };

export const useClipBus = create<Bus>(() => ({ pending: null }));

export function postAddedClip(projectId: string, added: AddedClip) {
  useClipBus.setState({ pending: { projectId, added } });
}

/** The clip waiting for this video, taken off the bus (null when there is none). */
export function takeAddedClip(projectId: string): AddedClip | null {
  const p = useClipBus.getState().pending;
  if (!p || p.projectId !== projectId) return null;
  useClipBus.setState({ pending: null });
  return p.added;
}
