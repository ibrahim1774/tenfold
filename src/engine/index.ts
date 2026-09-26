import { TenfoldEngine, type JobProgressPayload } from '../../modules/tenfold-engine';
import type {
  Analysis,
  AnalysisOptions,
  Cut,
  EditDocument,
  EditPlan,
  ExportOptions,
  ExportResult,
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
  analyze: async (projectId: string, options: AnalysisOptions) =>
    parse<Analysis>(await engine().analyze(projectId, JSON.stringify(options))),
  getAnalysis: async (projectId: string) => parse<Analysis>(await engine().getAnalysis(projectId)),
  plan: async (projectId: string, doc: EditDocument) => parse<EditPlan>(await engine().plan(projectId, JSON.stringify(doc))),
  suggestCuts: async (projectId: string, options: AnalysisOptions) =>
    parse<Cut[]>(await engine().suggestCuts(projectId, JSON.stringify(options))),
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
