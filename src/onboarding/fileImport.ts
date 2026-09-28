import { Image } from 'react-native';

import { TenfoldEngine } from '../../modules/tenfold-engine';
import { engineAvailable, type ImportedAsset } from '../engine';

/*
 * Importing a video file (a camera recording, the bundled sample) instead of a Photos pick.
 *
 * The engine doesn't have this yet. It needs one more native function, same shape as `pickVideos`:
 *
 *   importFile(uri: string, title: string): Promise<string>   // ImportedAsset JSON
 *
 * It copies the file at `uri` (a file:// URL; in dev builds the bundled sample resolves to Metro's
 * http://localhost URL) into a new project folder, reads its media info, writes a poster frame, and
 * returns { projectId, title, media, posterUri } like one element of `pickVideos`. Until a build
 * has it, callers show why the action is unavailable.
 */

type FileImporter = { importFile?: (uri: string, title: string) => Promise<string> };

export function canImportFiles(): boolean {
  return engineAvailable() && typeof (TenfoldEngine as unknown as FileImporter | null)?.importFile === 'function';
}

export async function importFile(uri: string, title: string): Promise<ImportedAsset> {
  const native = TenfoldEngine as unknown as FileImporter | null;
  if (!native?.importFile || !engineAvailable()) {
    throw new Error('This build of Tenfold can’t import a video file yet.');
  }
  const asset = JSON.parse(await native.importFile(uri, title)) as ImportedAsset;
  if (asset.error) throw new Error(asset.error);
  return asset;
}

/*
 * The bundled sample clip for the demo and the Library's sample project.
 * TODO: add assets/sample/sample.mp4 (a ~40 s raw talking-to-camera take with a few "um"s, pauses and
 * one retake) and replace `null` with `require('../../assets/sample/sample.mp4')`. Metro bundles .mp4
 * as an asset by default. Requiring a missing file would break the bundle, so it stays null until then.
 */
const SAMPLE_CLIP_MODULE: number | null = null;

export const SAMPLE_TITLE = 'Sample clip';

/** Whether this build bundles the sample clip. Without it the demo (onboarding step, /demo) is hidden everywhere. */
export function hasSampleClip(): boolean {
  return SAMPLE_CLIP_MODULE != null;
}

/** URI of the bundled sample clip, or null when this build doesn't include one. */
export function sampleClipUri(): string | null {
  if (SAMPLE_CLIP_MODULE == null) return null;
  return Image.resolveAssetSource(SAMPLE_CLIP_MODULE)?.uri ?? null;
}
