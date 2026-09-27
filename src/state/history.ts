import { create } from 'zustand';

import type { EditDocument } from '../engine/types';
import { useLibrary } from './library';

// Undo/redo per video, shared by the editor and the caption sheet (session only, not persisted).
type History = { past: Record<string, EditDocument[]>; future: Record<string, EditDocument[]> };

export const useEditHistory = create<History>(() => ({ past: {}, future: {} }));

const LIMIT = 50;

/** Saves an edit and makes it undoable. */
export function commitDoc(projectId: string, next: EditDocument) {
  const current = useLibrary.getState().docs[projectId];
  if (current) {
    useEditHistory.setState((h) => ({
      past: { ...h.past, [projectId]: [...(h.past[projectId] ?? []).slice(-(LIMIT - 1)), current] },
      future: { ...h.future, [projectId]: [] },
    }));
  }
  useLibrary.getState().setDoc(projectId, next);
}

export function undoDoc(projectId: string) {
  const { past, future } = useEditHistory.getState();
  const prev = past[projectId]?.at(-1);
  const current = useLibrary.getState().docs[projectId];
  if (!prev || !current) return;
  useEditHistory.setState({
    past: { ...past, [projectId]: past[projectId].slice(0, -1) },
    future: { ...future, [projectId]: [current, ...(future[projectId] ?? [])] },
  });
  useLibrary.getState().setDoc(projectId, prev);
}

export function redoDoc(projectId: string) {
  const { past, future } = useEditHistory.getState();
  const next = future[projectId]?.[0];
  const current = useLibrary.getState().docs[projectId];
  if (!next || !current) return;
  useEditHistory.setState({
    past: { ...past, [projectId]: [...(past[projectId] ?? []), current] },
    future: { ...future, [projectId]: future[projectId].slice(1) },
  });
  useLibrary.getState().setDoc(projectId, next);
}

/**
 * Writes an explicit clip order into the saved document and every undo/redo step that has none, without
 * adding a step. Called before the first clip is added to a video, so undo can take the new clip out again
 * (a document without `clipOrder` plays every clip the video has). See src/editor/clips.ts.
 */
export function pinClipOrder(projectId: string, order: string[]) {
  const pin = (d: EditDocument): EditDocument => (d.clipOrder ? d : { ...d, clipOrder: order });
  const current = useLibrary.getState().docs[projectId];
  if (current && !current.clipOrder) useLibrary.getState().setDoc(projectId, pin(current));
  const { past, future } = useEditHistory.getState();
  useEditHistory.setState({
    past: { ...past, [projectId]: (past[projectId] ?? []).map(pin) },
    future: { ...future, [projectId]: (future[projectId] ?? []).map(pin) },
  });
}
