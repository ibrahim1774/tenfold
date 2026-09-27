import { NativeModule, requireOptionalNativeModule } from 'expo';

import { TenfoldEngineModuleEvents } from './TenfoldEngine.types';

// All structured values cross the bridge as JSON strings (Codable on the Swift side).
declare class TenfoldEngineModule extends NativeModule<TenfoldEngineModuleEvents> {
  ping(): string;
  thermalState(): 'nominal' | 'fair' | 'serious' | 'critical';
  isLowPowerMode(): boolean;
  freeDiskBytes(): number;
  setKeepAwake(on: boolean): Promise<void>;
  /** System colour picker; resolves "#RRGGBB", or null when closed without a choice. Absent in older builds. */
  pickColor?(initialHex: string): Promise<string | null>;
  pickVideos(maxCount: number): Promise<string>;
  /** Imports a video file (file:// or dev-server http URL) into a new project; ImportedAsset JSON. Absent in older builds. */
  importFile?(uri: string, title: string): Promise<string>;
  speechStatus(language: string): Promise<string>;
  prepareSpeech(language: string): Promise<string>;
  analyze(projectId: string, optionsJSON: string): Promise<string>;
  getAnalysis(projectId: string): Promise<string>;
  plan(projectId: string, docJSON: string): Promise<string>;
  suggestCuts(projectId: string, optionsJSON: string): Promise<string>;
  thumbnails(projectId: string, count: number): Promise<string>;
  export(projectId: string, docJSON: string, optionsJSON: string): Promise<string>;
  cancel(projectId: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  projectExists(projectId: string): Promise<boolean>;
  storageBytes(): Promise<number>;
  clearExports(): Promise<void>;
}

// Optional so the JS bundle still loads in a client built before the module existed.
export default requireOptionalNativeModule<TenfoldEngineModule>('TenfoldEngine');
