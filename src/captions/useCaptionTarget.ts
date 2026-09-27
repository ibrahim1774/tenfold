import { useCallback } from 'react';

import type { CaptionSettings } from '../engine/types';
import { commitDoc } from '../state/history';
import { useLibrary } from '../state/library';

/**
 * The caption settings the captions sheet and its pickers edit: one video's (`projectId`, each change
 * is an undoable edit and shows in the live preview at once) or a batch's preset (`batchId`).
 * `update` reads the saved state at call time, so two quick changes never overwrite each other.
 */
export function useCaptionTarget(projectId?: string, batchId?: string) {
  const settings = useLibrary((s) => (projectId ? s.docs[projectId]?.captions : batchId ? s.batches[batchId]?.preset.captions : undefined));

  const update = useCallback(
    (change: (c: CaptionSettings) => CaptionSettings) => {
      const lib = useLibrary.getState();
      if (projectId) {
        const doc = lib.docs[projectId];
        if (!doc) return;
        const next = change(doc.captions);
        if (JSON.stringify(next) !== JSON.stringify(doc.captions)) commitDoc(projectId, { ...doc, captions: next });
      } else if (batchId) {
        const b = lib.batches[batchId];
        if (!b) return;
        lib.updateBatch(batchId, { preset: { ...b.preset, presetId: 'custom', captions: change(b.preset.captions) } });
      }
    },
    [projectId, batchId],
  );

  return { settings, update };
}
