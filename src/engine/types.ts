// TypeScript mirrors of the Swift Codable records in modules/tenfold-engine/ios/Engine/Core/Models.swift.

export type SilenceLevel = 'off' | 'light' | 'medium' | 'aggressive';
export type FillerLevel = 'off' | 'standard' | 'aggressive';
export type ZoomMode = 'off' | 'subtle' | 'dynamic';
export type AudioMode = 'original' | 'normalize' | 'mute';
export type CaptionStyleId =
  | 'pop'
  | 'tiktok'
  | 'highlight'
  | 'oneword'
  | 'karaoke'
  | 'boxed'
  | 'neon'
  | 'typewriter'
  | 'outline'
  | 'handwritten'
  | 'minimal'
  | 'subtle'
  /** A preset the user changed; `baseStyleId` names the preset it started from. */
  | 'custom';
/** How the spoken word is shown (Swift CaptionAnimation). */
export type CaptionAnimation = 'pop' | 'karaoke' | 'box' | 'none' | 'underline' | 'highlight' | 'neon' | 'reveal' | 'classic';
export type CaptionBackground = 'none' | 'box' | 'translucent' | 'highlight';
export type CaptionOutline = 'none' | 'thin' | 'thick';
export type CaptionFont =
  | 'tiktok'
  | 'typewriter'
  | 'handwriting'
  | 'serif'
  | 'poppins'
  | 'inter'
  | 'bebas'
  | 'montserrat'
  | 'sfRounded';
export type PresetId = 'cleanTalk' | 'punchy' | 'podcast' | 'story' | 'custom';
export type CutReason = 'silence' | 'filler' | 'retake' | 'manual';

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
  /** The preset a 'custom' style starts from. */
  baseStyleId?: Exclude<CaptionStyleId, 'custom'>;
  // Look overrides on top of the preset; absent = the preset's own (Swift CaptionStyle.resolve).
  background?: CaptionBackground;
  outline?: CaptionOutline;
  shadow?: boolean;
  animation?: CaptionAnimation;
};

/**
 * Hand edits to caption groups. A group's id is "w" + its first word's transcript index, so ids stay
 * the same when other groups are split, merged or retimed. All times are source seconds.
 */
export type CaptionEdits = {
  /** A group must start here (split). The start of the new group's first word. */
  boundaries?: number[];
  /** The grouper must not break here (merge). The start of the absorbed group's first word. */
  merges?: number[];
  /** Ids of hidden groups. */
  hidden?: string[];
  timing?: { id: string; start?: number; end?: number }[];
};

export type TextOverlayStyle = 'classic' | 'elegance' | 'neon' | 'retro' | 'comic' | 'typewriter' | 'handwriting' | 'serif' | 'bold';
export type TextOverlayBox = 'none' | 'filled' | 'translucent' | 'outline';
export type TextAlign = 'left' | 'center' | 'right';

/**
 * A title, hook or line of subtext on the finished video (Swift TextOverlay). Geometry is in fractions of the
 * output canvas, so it survives aspect and quality changes. Times are OUTPUT (composition) seconds, after cuts,
 * because titles are placed on the edited video; undefined = the whole clip.
 */
export type TextOverlay = {
  id: string;
  text: string;
  style: TextOverlayStyle;
  box: TextOverlayBox;
  /** "#RRGGBB" text colour. A filled / translucent box takes this colour and the text turns black or white. */
  color: string;
  align: TextAlign;
  /** Font size as a fraction of min(canvas width, height): default 0.07, range 0.03–0.2. */
  size: number;
  /** Centre of the text box, fractions of the canvas (0..1). */
  x: number;
  y: number;
  /** Degrees, clockwise. */
  rotation: number;
  start?: number;
  end?: number;
};

/**
 * A stretch of sound on the timeline (Swift AudioClip). Times are OUTPUT seconds, like text overlays.
 * 'original' = the clip's own sound, mapped to source time through the cuts (original clips never overlap;
 * a deleted stretch is silence). 'file' = a sound in the project folder (`file`, e.g. "audio/<id>.m4a").
 */
export type AudioClip = {
  id: string;
  source: 'original' | 'file';
  file?: string;
  /** "Voiceover 1", the file's name, "Sound from IMG_0042". */
  title?: string;
  start: number;
  end: number;
  /** Seconds into the file that play at `start` (trimmed head); 0 for original clips. */
  offset: number;
  /** 0..2 (1 = as recorded). */
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /** Repeat the file to fill start..end. */
  loop?: boolean;
  /** File clips: dip to 20% while someone speaks. */
  ducking?: boolean;
  /** Length of the file when added (trim limits in the editor; the engine probes the file itself). */
  fileDuration?: number;
};

/** A sound added to a project by the engine (Files, Photos, voiceover). */
export type AddedAudio = { file?: string; title?: string; durationSec?: number; error?: string };

export type EditDocument = {
  version: 1;
  cuts: Cut[];
  wordOverrides: { wordIndex: number; text: string }[];
  captions: CaptionSettings;
  zoom: { mode: ZoomMode; intensity: 1 | 2 | 3; faceFollow: boolean };
  /** `aspect` wins; `auto916` is the legacy switch for documents saved before aspect ratios existed. */
  crop: CropSettings;
  audio: { mode: AudioMode };
  /** Split points (source seconds) the user added on the timeline. UI only: the engine ignores them. */
  splits?: number[];
  /** Split / merge / hide / retime edits to caption groups. */
  captionEdits?: CaptionEdits;
  /** Titles and other text on the video (output time). Per clip. */
  textOverlays?: TextOverlay[];
  /**
   * The sound as clips in output time. Absent = one original track over the whole video, muted when
   * `audio.mode` is 'mute' (documents before audio editing). See src/editor/audioClips.ts.
   */
  audioClips?: AudioClip[];
  /** Pause/filler strength last picked in the editor (UI only). */
  levels?: { silence: SilenceLevel; fillers: FillerLevel; retakes?: boolean };
};

export type AspectRatio = 'original' | '9:16' | '1:1' | '4:5' | '16:9';

/**
 * Output frame. `scale` present = the user placed the video (1 = Fit, black where it doesn't reach);
 * absent = automatic framing (fill the canvas, follow the speaker). Offsets are fractions of the canvas.
 */
export type CropSettings = {
  auto916: boolean;
  aspect?: AspectRatio;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
};

export type AnalysisOptions = { silence: SilenceLevel; fillers: FillerLevel; retakes?: boolean; language: string };

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
export type CaptionCard = { id: string; start: number; end: number; words: CardWord[] };

export type EditPlan = {
  segments: CompSegment[];
  compDuration: number;
  zoom: ZoomEvent[];
  cards: CaptionCard[];
  removedSec: number;
  /** Groups the user hid (not rendered). Absent from builds before caption edits. */
  hiddenCards?: CaptionCard[];
  /** When kept words are spoken (output seconds, padded, merged): where ducked sounds dip. Absent in older builds. */
  speech?: { start: number; end: number }[];
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
export type ExportResult = {
  uri: string;
  savedToPhotos: boolean;
  photosDenied: boolean;
  saveError?: string;
  durationSec: number;
  elapsedSec: number;
};

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
  /** Which edits Tenfold applies to this video. Absent = the batch defaults (see src/batch/edits.ts). */
  edits?: EditSelection;
  createdAt: number;
};

export type EditKey = 'captions' | 'fillers' | 'pauses' | 'retakes' | 'zoom' | 'reframe';
export type EditSelection = Record<EditKey, boolean>;

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
