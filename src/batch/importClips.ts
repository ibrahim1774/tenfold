import { Alert } from 'react-native';

import { Engine, type ImportedAsset } from '../engine';
import { maxBatchSize, useEntitlements } from '../state/entitlements';
import { useLibrary } from '../state/library';
import { batchPreset } from '../state/presets';
import { useSettings } from '../state/settings';
import { errorText } from './queue';

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

/** Opens the Photos picker and creates a new batch. Returns the batch id, or null if nothing was picked. */
export async function importNewBatch(): Promise<string | null> {
  const isPro = useEntitlements.getState().isPro;
  try {
    const assets = report(await Engine.pickVideos(maxBatchSize(isPro)));
    if (assets.length === 0) return null;
    return useLibrary.getState().createBatch(assets, batchPreset(useSettings.getState().defaultPreset));
  } catch (e) {
    Alert.alert('Couldn’t import', errorText(e));
    return null;
  }
}

/** Adds more clips to a batch that hasn't started yet. */
export async function importIntoBatch(batchId: string) {
  const { batches } = useLibrary.getState();
  const batch = batches[batchId];
  if (!batch) return;
  const room = maxBatchSize(useEntitlements.getState().isPro) - batch.projectIds.length;
  if (room <= 0) return;
  try {
    const assets = report(await Engine.pickVideos(room));
    if (assets.length) useLibrary.getState().addToBatch(batchId, assets);
  } catch (e) {
    Alert.alert('Couldn’t import', errorText(e));
  }
}
