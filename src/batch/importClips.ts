import { Alert } from 'react-native';
import { create } from 'zustand';

import { Engine, type ImportedAsset, type ProjectClip } from '../engine';
import { cleanClipTitle, LEGACY_CLIP_ID, projectClipsFrom } from '../editor/clips';
import { maxBatchSize, tierOf, useEntitlements } from '../state/entitlements';
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
    const limit = maxBatchSize(tierOf(useEntitlements.getState()));
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
    const room = maxBatchSize(tierOf(useEntitlements.getState())) - batch.projectIds.length;
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

/**
 * Opens the Photos picker and joins every picked video into ONE video (its clips, in the order picked) in a
 * new batch. Returns the batch id, or null if nothing was picked. Builds that can't join make one video per clip.
 */
export function importJoinedBatch(): Promise<string | null> {
  return exclusive<string | null>(null, async () => {
    const limit = maxBatchSize(tierOf(useEntitlements.getState()));
    try {
      const assets = capped(report(await Engine.pickVideos(limit)), limit);
      if (assets.length === 0) return null;
      const preset = batchPreset(useSettings.getState().defaultPreset, useSettings.getState().platforms);
      if (assets.length === 1 || !Engine.canAddClips()) return useLibrary.getState().createBatch(assets, preset);
      const [first, ...others] = assets;
      const added = await Engine.joinProjects(first.projectId, others.map((a) => a.projectId));
      const failed = added.filter((a) => a.error);
      if (failed.length) {
        Alert.alert(
          failed.length === 1 ? 'One clip couldn’t be joined' : `${failed.length} clips couldn’t be joined`,
          failed.map((f) => `${f.title ?? 'Clip'}: ${f.error}`).join('\n'),
        );
      }
      const clips: ProjectClip[] = [
        { id: LEGACY_CLIP_ID, title: cleanClipTitle(first.title), durationSec: first.media?.durationSec ?? 0, posterUri: first.posterUri, media: first.media },
        ...projectClipsFrom(added),
      ];
      const batchId = useLibrary.getState().createBatch([first], preset);
      if (clips.length > 1 && first.media) {
        const total = clips.reduce((sum, c) => sum + c.durationSec, 0);
        useLibrary.getState().updateProject(first.projectId, { clips, media: { ...first.media, durationSec: total } });
      }
      return batchId;
    } catch (e) {
      Alert.alert('Couldn’t import', errorText(e));
      return null;
    }
  });
}
