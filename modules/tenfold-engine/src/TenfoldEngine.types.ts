import type { StyleProp, ViewStyle } from 'react-native';

export type JobStage =
  | 'extractingAudio'
  | 'transcribing'
  | 'detecting'
  | 'planning'
  | 'rendering'
  | 'exporting'
  | 'saving';

export type JobProgressPayload = {
  jobId: string;
  projectId: string;
  stage: JobStage;
  fraction: number;
};

export type JobState = 'queued' | 'analyzing' | 'ready' | 'exporting' | 'done' | 'failed';

export type JobStateChangePayload = {
  jobId: string;
  projectId: string;
  state: JobState;
  reason?: string;
};

export type ModelDownloadProgressPayload = {
  bytesWritten: number;
  bytesExpected: number;
  fraction: number;
};

export type TenfoldEngineModuleEvents = {
  onJobProgress: (params: JobProgressPayload) => void;
  onJobStateChange: (params: JobStateChangePayload) => void;
  onModelDownloadProgress: (params: ModelDownloadProgressPayload) => void;
};

export type PreviewTimeEvent = { nativeEvent: { time: number } };
export type PreviewReadyEvent = { nativeEvent: { projectId: string } };

export type TenfoldPreviewViewProps = {
  projectId: string;
  playing?: boolean;
  onTime?: (event: PreviewTimeEvent) => void;
  onReady?: (event: PreviewReadyEvent) => void;
  onEnd?: () => void;
  style?: StyleProp<ViewStyle>;
};
