import { NativeModule, requireOptionalNativeModule } from 'expo';

import { TenfoldEngineModuleEvents } from './TenfoldEngine.types';

// All structured values cross the bridge as JSON strings (Codable on the Swift side).
declare class TenfoldEngineModule extends NativeModule<TenfoldEngineModuleEvents> {
  ping(): string;
  thermalState(): 'nominal' | 'fair' | 'serious' | 'critical';
  isLowPowerMode(): boolean;
  freeDiskBytes(): number;
  setKeepAwake(on: boolean): Promise<void>;
  pickVideos(maxCount: number): Promise<string>;
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
