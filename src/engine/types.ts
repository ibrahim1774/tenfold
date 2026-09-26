// TypeScript mirrors of the Swift Codable records in modules/tenfold-engine/ios/Engine/Core/Models.swift.

export type SilenceLevel = 'off' | 'light' | 'medium' | 'aggressive';
export type FillerLevel = 'off' | 'standard' | 'aggressive';
export type ZoomMode = 'off' | 'subtle' | 'dynamic';
export type AudioMode = 'original' | 'normalize' | 'mute';
export type CaptionStyleId = 'pop' | 'karaoke' | 'boxed' | 'outline' | 'minimal' | 'subtle';
export type CaptionFont = 'poppins' | 'inter' | 'bebas' | 'montserrat' | 'sfRounded';
export type PresetId = 'cleanTalk' | 'punchy' | 'podcast' | 'story' | 'custom';
export type CutReason = 'silence' | 'filler' | 'manual';

export type Word = { text: string; start: number; end: number; confidence: number; isFiller: boolean };

export type TranscriptStats = {
  runCount: number;
  singleWordRunRatio: number;
  lexicalFillerCount: number;
  elapsedSec: number;
};

export type Transcript = {
  words: Word[];
  language: string;
  engine: string;
  wordTimingIsExact: boolean;
  stats: TranscriptStats;
};

export type Cut = { id: string; start: number; end: number; reason: CutReason; accepted: boolean; confidence: number };

export type MediaInfo = {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  isHDR: boolean;
  hasAudio: boolean;
};

export type FacePoint = { time: number; x: number; y: number };

export type Analysis = {
  version: number;
  media: MediaInfo;
  transcript?: Transcript | null;
  envelopeDb: number[];
  noiseFloorDb: number;
  speechThresholdDb: number;
  speechCoverage: number;
  noSpeech: boolean;
  cuts: Cut[];
  faces: FacePoint[];
  warnings: string[];
};

export type CaptionSettings = {
  styleId: CaptionStyleId;
  font: CaptionFont;
  sizeScale: number;
  colors: { base: string; active: string; stroke: string; bg: string };
  position: { y: number };
  uppercase: boolean;
  maxWords: number;
  enabled: boolean;
};

export type EditDocument = {
  version: 1;
  cuts: Cut[];
  wordOverrides: { wordIndex: number; text: string }[];
  captions: CaptionSettings;
  zoom: { mode: ZoomMode; intensity: 1 | 2 | 3; faceFollow: boolean };
  crop: { auto916: boolean };
  audio: { mode: AudioMode };
};

export type AnalysisOptions = { silence: SilenceLevel; fillers: FillerLevel; language: string };

export type BatchPreset = {
  presetId: PresetId;
  analysis: AnalysisOptions;
  captions: CaptionSettings;
  zoom: EditDocument['zoom'];
  crop: EditDocument['crop'];
  audio: EditDocument['audio'];
  autoExport: boolean;
};

export type CompSegment = { start: number; end: number; compStart: number; compEnd: number };
export type ZoomEvent = { at: number; scale: number; anchorX: number; anchorY: number; ramp: number };
export type CardWord = { index: number; text: string; start: number; end: number; emphasis: boolean };
export type CaptionCard = { start: number; end: number; words: CardWord[] };

export type EditPlan = {
  segments: CompSegment[];
  compDuration: number;
  zoom: ZoomEvent[];
  cards: CaptionCard[];
  removedSec: number;
};

export type ImportedAsset = {
  projectId: string;
  title: string;
  media?: MediaInfo | null;
  posterUri?: string | null;
  error?: string | null;
};

export type Thumbnail = { time: number; uri: string };

export type RenderQuality = 'preview' | 'hd' | 'uhd';
export type ExportOptions = { quality: RenderQuality; watermark: boolean; saveToPhotos: boolean; keepHDR: boolean };
export type ExportResult = { uri: string; savedToPhotos: boolean; photosDenied: boolean; durationSec: number; elapsedSec: number };

export type SpeechStatus = { state: 'unsupported' | 'supported' | 'downloading' | 'installed'; locale: string };

// App-side records (persisted in the library store).

export type ProjectStatus =
  | 'importing'
  | 'pending' // imported, batch not started
  | 'queued'
  | 'analyzing'
  | 'ready'
  | 'exportQueued'
  | 'exporting'
  | 'done'
  | 'failed'
  | 'cancelled';

export type Project = {
  id: string;
  batchId: string;
  title: string;
  posterUri?: string | null;
  media?: MediaInfo | null;
  status: ProjectStatus;
  stage?: string;
  progress: number;
  error?: string;
  warnings?: string[];
  exportUri?: string;
  exportedAt?: number;
  savedToPhotos?: boolean;
  createdAt: number;
};

export type BatchStatus = 'setup' | 'processing' | 'ready' | 'exported';

export type Batch = {
  id: string;
  createdAt: number;
  title: string;
  preset: BatchPreset;
  captionsOff: boolean;
  projectIds: string[];
  paused: boolean;
  startedAt?: number;
};
