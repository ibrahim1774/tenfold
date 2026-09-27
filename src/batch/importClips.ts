import { Alert } from 'react-native';
import { create } from 'zustand';

import { Engine, type ImportedAsset } from '../engine';
import { maxBatchSize, useEntitlements } from '../state/entitlements';
import { useLibrary } from '../state/library';
import { batchPreset } from '../state/presets';
import { useSettings } from '../state/settings';
import { errorText, pump } from './queue';

/** True while the Photos picker is open or picked clips are still copying in (iCloud can take minutes). */
export const useImporting = create<{ busy: boolean }>(() => ({ busy: false }));

async function exclusive<T>(fallback: T, work: () => Promise<T>): Promise<T> {
  if (useImporting.getState().busy) return fallback; // a second tap while the picker is up would hang
  useImporting.setState({ busy: true });
  try {
    return await work();
  } finally {
    useImporting.setState({ busy: false });
  }
}

function report(assets: ImportedAsset[]) {
  const failed = assets.filter((a) => a.error);
  if (failed.length > 0) {
    Alert.alert(
      failed.length === 1 ? 'One clip was skipped' : `${failed.length} clips were skipped`,
      failed.map((f) => `${f.title}: ${f.error}`).join('\n'),
    );
  }
  return assets.filter((a) => !a.error);
}

/** Keeps at most `max` clips. The picker already enforces the limit; anything past it is deleted, not added. */
function capped(assets: ImportedAsset[], max: number) {
  assets.slice(max).forEach((a) => Engine.deleteProject(a.projectId).catch(() => {}));
  return assets.slice(0, max);
}

/** Opens the Photos picker and creates a new batch. Returns the batch id, or null if nothing was picked. */
export function importNewBatch(): Promise<string | null> {
  return exclusive<string | null>(null, async () => {
    const limit = maxBatchSize(useEntitlements.getState().isPro);
    try {
      const assets = capped(report(await Engine.pickVideos(limit)), limit);
      if (assets.length === 0) return null;
      return useLibrary.getState().createBatch(assets, batchPreset(useSettings.getState().defaultPreset, useSettings.getState().platforms));
    } catch (e) {
      Alert.alert('Couldn’t import', errorText(e));
      return null;
    }
  });
}

/** Adds more clips to a batch. If the batch has started meanwhile, the new clips join the queue. */
export function importIntoBatch(batchId: string): Promise<void> {
  return exclusive(undefined, async () => {
    const batch = useLibrary.getState().batches[batchId];
    if (!batch) return;
    const room = maxBatchSize(useEntitlements.getState().isPro) - batch.projectIds.length;
    if (room <= 0) return;
    try {
      const assets = capped(report(await Engine.pickVideos(room)), room);
      if (!assets.length) return;
      const lib = useLibrary.getState();
      lib.addToBatch(batchId, assets);
      if (lib.batches[batchId]?.startedAt) {
        assets.forEach((a) => useLibrary.getState().updateProject(a.projectId, { status: 'queued', progress: 0 }));
        pump();
      }
    } catch (e) {
      Alert.alert('Couldn’t import', errorText(e));
    }
  });
}
