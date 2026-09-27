import { TenfoldEngine, type JobProgressPayload } from '../../modules/tenfold-engine';
import type {
  Analysis,
  AnalysisOptions,
  Cut,
  EditDocument,
  EditPlan,
  ExportOptions,
  ExportResult,
  AddedAudio,
  AddedClip,
  ImportedAsset,
  SpeechStatus,
  Thumbnail,
} from './types';

export * from './types';
export { TenfoldPreviewView } from '../../modules/tenfold-engine';
export type { JobProgressPayload, TenfoldPreviewViewRef } from '../../modules/tenfold-engine';

export class EngineUnavailableError extends Error {
  constructor() {
    super('This build of Tenfold doesn’t include the video engine yet. Install the latest development build.');
  }
}

function engine() {
  if (!TenfoldEngine || !engineAvailable()) throw new EngineUnavailableError();
  return TenfoldEngine;
}

/** The native module only when this build has the full engine (older dev builds shipped a stub). */
const live = () => (engineAvailable() ? TenfoldEngine : null);

export function engineAvailable(): boolean {
  try {
    return TenfoldEngine?.ping() === 'pong' && typeof TenfoldEngine?.analyze === 'function';
  } catch {
    return false;
  }
}

export function pingEngine(): string | null {
  try {
    return TenfoldEngine?.ping() ?? null;
  } catch {
    return null;
  }
}

const parse = <T,>(s: string): T => JSON.parse(s) as T;

export const Engine = {
  pickVideos: async (max: number) => parse<ImportedAsset[]>(await engine().pickVideos(max)),
  speechStatus: async (language = 'auto') => parse<SpeechStatus>(await engine().speechStatus(language)),
  prepareSpeech: async (language = 'auto') => parse<SpeechStatus>(await engine().prepareSpeech(language)),
  /** `clipIds`: analyse only these clips (just added to a multi-clip project). */
  analyze: async (projectId: string, options: AnalysisOptions, clipIds?: string[]) =>
    parse<Analysis>(
      clipIds?.length
        ? await engine().analyze(projectId, JSON.stringify(options), JSON.stringify(clipIds))
        : await engine().analyze(projectId, JSON.stringify(options)),
    ),
  /** `order`: the clips in this play order (EditDocument.clipOrder); absent = the order added. */
  getAnalysis: async (projectId: string, order?: string[]) =>
    parse<Analysis>(order ? await engine().getAnalysis(projectId, JSON.stringify(order)) : await engine().getAnalysis(projectId)),
  plan: async (projectId: string, doc: EditDocument) => parse<EditPlan>(await engine().plan(projectId, JSON.stringify(doc))),
  suggestCuts: async (projectId: string, options: AnalysisOptions, order?: string[]) =>
    parse<Cut[]>(
      order
        ? await engine().suggestCuts(projectId, JSON.stringify(options), JSON.stringify(order))
        : await engine().suggestCuts(projectId, JSON.stringify(options)),
    ),
  thumbnails: async (projectId: string, count: number) => parse<Thumbnail[]>(await engine().thumbnails(projectId, count)),
  export: async (projectId: string, doc: EditDocument, options: ExportOptions) =>
    parse<ExportResult>(await engine().export(projectId, JSON.stringify(doc), JSON.stringify(options))),
  cancel: (projectId: string) => engine().cancel(projectId),
  deleteProject: (projectId: string) => engine().deleteProject(projectId),
  projectExists: (projectId: string) => engine().projectExists(projectId),
  storageBytes: () => engine().storageBytes(),
  clearExports: () => engine().clearExports(),
  setKeepAwake: (on: boolean) => live()?.setKeepAwake(on) ?? Promise.resolve(),
  thermalState: () => live()?.thermalState() ?? 'nominal',
  isLowPowerMode: () => live()?.isLowPowerMode() ?? false,
  freeDiskBytes: () => live()?.freeDiskBytes() ?? 0,
  /** True when this build has the system colour picker (older builds don't: use a swatch grid). */
  canPickColor: () => typeof live()?.pickColor === 'function',
  /** System colour picker. "#RRGGBB", or null when closed without a choice or unavailable in this build. */
  pickColor: async (initialHex: string): Promise<string | null> => {
    const m = live();
    if (typeof m?.pickColor !== 'function') return null;
    return (await m.pickColor(initialHex)) ?? null;
  },
  /** True when this build can edit audio lanes (older builds ignore audioClips in preview and export). */
  canEditAudio: () => typeof live()?.audioWaveform === 'function',
  /** Files picker for a sound. `error: 'cancelled'` when closed; `unavailable` in older builds. */
  pickAudioFile: async (projectId: string): Promise<AddedAudio> => {
    const m = live();
    if (typeof m?.pickAudioFile !== 'function') return { error: 'unavailable' };
    return parse<AddedAudio>(await m.pickAudioFile(projectId));
  },
  /** Photos picker for one video; its sound becomes a file in the project. */
  extractAudio: async (projectId: string): Promise<AddedAudio> => {
    const m = live();
    if (typeof m?.extractAudio !== 'function') return { error: 'unavailable' };
    return parse<AddedAudio>(await m.extractAudio(projectId));
  },
  startVoiceover: async (projectId: string): Promise<AddedAudio> => {
    const m = live();
    if (typeof m?.startVoiceover !== 'function') return { error: 'unavailable' };
    return parse<AddedAudio>(await m.startVoiceover(projectId));
  },
  stopVoiceover: async (): Promise<AddedAudio> => {
    const m = live();
    if (typeof m?.stopVoiceover !== 'function') return { error: 'unavailable' };
    return parse<AddedAudio>(await m.stopVoiceover());
  },
  /** Waveform bars 0..1 for an added sound ([] in older builds). */
  audioWaveform: async (projectId: string, file: string, buckets: number): Promise<number[]> => {
    const m = live();
    if (typeof m?.audioWaveform !== 'function') return [];
    return parse<number[]>(await m.audioWaveform(projectId, file, buckets));
  },
  /** True when this build can add clips to a video (multi-clip projects). */
  canAddClips: () => typeof live()?.addClip === 'function',
  /** Adds a video file (a camera recording) to a project as a new clip. */
  addClip: async (projectId: string, uri: string, title: string): Promise<AddedClip> => {
    const m = live();
    if (typeof m?.addClip !== 'function') return { error: 'unavailable' };
    return parse<AddedClip>(await m.addClip(projectId, uri, title));
  },
  /** Photos picker for clips to add to a project ([] when closed). */
  pickClips: async (projectId: string, max: number): Promise<AddedClip[]> => {
    const m = live();
    if (typeof m?.pickClips !== 'function') return [{ error: 'unavailable' }];
    return parse<AddedClip[]>(await m.pickClips(projectId, max));
  },
  /** Files picker for one video to add. `error: 'cancelled'` when closed. */
  pickVideoFile: async (projectId: string): Promise<AddedClip> => {
    const m = live();
    if (typeof m?.pickVideoFile !== 'function') return { error: 'unavailable' };
    return parse<AddedClip>(await m.pickVideoFile(projectId));
  },
  /** Joins just-imported projects into `projectId` as its next clips (the others are deleted). */
  joinProjects: async (projectId: string, otherIds: string[]): Promise<AddedClip[]> => {
    const m = live();
    if (typeof m?.joinProjects !== 'function') return otherIds.map(() => ({ error: 'unavailable' }));
    return parse<AddedClip[]>(await m.joinProjects(projectId, JSON.stringify(otherIds)));
  },
  /** Deletes a clip no document uses (an add that failed). */
  removeClipFile: async (projectId: string, clipId: string): Promise<boolean> => {
    const m = live();
    if (typeof m?.removeClipFile !== 'function') return false;
    return m.removeClipFile(projectId, clipId);
  },
  deleteAudioFile: async (projectId: string, file: string): Promise<boolean> => {
    const m = live();
    if (typeof m?.deleteAudioFile !== 'function') return false;
    return m.deleteAudioFile(projectId, file);
  },
};

type Sub = { remove(): void };
const noop: Sub = { remove() {} };

export const EngineEvents = {
  onJobProgress: (cb: (e: JobProgressPayload) => void): Sub => live()?.addListener('onJobProgress', cb) ?? noop,
  onModelDownloadProgress: (cb: (e: { fraction: number }) => void): Sub =>
    live()?.addListener('onModelDownloadProgress', cb) ?? noop,
  onImportProgress: (cb: (e: { index: number; total: number }) => void): Sub =>
    live()?.addListener('onImportProgress', cb) ?? noop,
};
