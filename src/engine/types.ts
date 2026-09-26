// TypeScript mirrors of the Swift Codable records (spec §4, §6).
// Keep 1:1 with modules/tenfold-engine/ios/Engine/Models.swift once it exists (M1).

export type SilenceLevel = 'off' | 'light' | 'medium' | 'aggressive';
export type FillerLevel = 'off' | 'standard' | 'aggressive';
export type ZoomMode = 'off' | 'subtle' | 'dynamic';
export type AudioMode = 'original' | 'normalize' | 'mute';
export type CaptionStyleId = 'pop' | 'karaoke' | 'boxed' | 'outline' | 'minimal' | 'subtle';
export type CaptionFont = 'poppins' | 'inter' | 'bebas' | 'montserrat' | 'sfRounded';
export type PresetId = 'cleanTalk' | 'punchy' | 'podcast' | 'story' | 'custom';

export type Word = {
  text: string;
  start: number;
  end: number;
  confidence: number;
  isFiller: boolean;
};

export type Transcript = {
  words: Word[];
  language: string;
  engine: 'parakeet' | 'apple';
  wordTimingIsExact: boolean;
};

export type CutReason = 'silence' | 'filler' | 'manual';

export type Cut = {
  id: string;
  start: number;
  end: number;
  reason: CutReason;
  accepted: boolean;
  confidence: number;
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

export type AnalysisOptions = {
  silence: SilenceLevel;
  fillers: FillerLevel;
  language: string | 'auto';
};

export type BatchPreset = {
  presetId: PresetId;
  analysis: AnalysisOptions;
  captions: CaptionSettings;
  zoom: EditDocument['zoom'];
  crop: EditDocument['crop'];
  audio: EditDocument['audio'];
  autoExport: boolean;
};

export type ProjectStatus = 'queued' | 'analyzing' | 'ready' | 'exporting' | 'done' | 'failed';

export type Project = {
  id: string;
  batchId: string;
  title: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  isHDR: boolean;
  hasAudio: boolean;
  status: ProjectStatus;
  stage?: string;
  progress: number;
  thumbColor: string; // M0 mock stand-in for a real thumbnail file URL
  errorText?: string;
};

export type Batch = {
  id: string;
  createdAt: number;
  title: string;
  preset: BatchPreset;
  projectIds: string[];
  status: 'setup' | 'processing' | 'ready' | 'exported';
};
