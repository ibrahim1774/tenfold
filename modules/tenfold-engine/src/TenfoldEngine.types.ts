import type { StyleProp, ViewStyle } from 'react-native';

export type JobProgressPayload = {
  projectId: string;
  stage: 'extractingAudio' | 'transcribing' | 'detecting' | 'planning' | 'rendering' | 'exporting' | 'saving';
  fraction: number;
  /** Which clip the analysis is on (0-based) and how many it runs over. Absent from older builds. */
  clipIndex?: number;
  clipCount?: number;
  /** "clips" when only some clips are analysed (the editor adding clips); "project" for a whole analysis. */
  scope?: 'project' | 'clips';
};

export type ModelDownloadProgressPayload = { fraction: number };
export type ImportProgressPayload = { index: number; total: number };

export type TenfoldEngineModuleEvents = {
  onJobProgress: (params: JobProgressPayload) => void;
  onJobStateChange: (params: { projectId: string; state: string }) => void;
  onModelDownloadProgress: (params: ModelDownloadProgressPayload) => void;
  onImportProgress: (params: ImportProgressPayload) => void;
};

export type TenfoldPreviewViewProps = {
  projectId: string;
  /** EditDocument as JSON. The view rebuilds its composition (debounced) when it changes. */
  document: string;
  playing?: boolean;
  muted?: boolean;
  onTime?: (event: { nativeEvent: { time: number } }) => void;
  onReady?: (event: { nativeEvent: { duration: number; width: number; height: number } }) => void;
  onEnd?: () => void;
  /** The player actually started or stopped (including at the end of the clip). */
  onPlayingChange?: (event: { nativeEvent: { playing: boolean } }) => void;
  onError?: (event: { nativeEvent: { message: string } }) => void;
  style?: StyleProp<ViewStyle>;
};

/** Methods available on a ref to the native preview view. */
export type TenfoldPreviewViewRef = {
  seek(time: number): Promise<void>;
};
