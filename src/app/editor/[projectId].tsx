import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorText, stageProgress, STAGE_LABELS } from '@/batch/queue';
import {
  AppText,
  Background,
  Chip,
  ChipGroup,
  GlassCapsule,
  GlassSurface,
  GradientButton,
  IconButton,
  OptionLabel,
  OutlineButton,
  PressableScale,
  ScreenHeader,
  ToggleRow,
} from '@/design/components';
import { dark, radii, spacing, type as typeScale } from '@/design/tokens';
import { editsOf, effectiveLevels } from '@/batch/edits';
import { ASPECTS, aspectOf, aspectRatioValue } from '@/editor/aspect';
import { fillUserScale, type Placement } from '@/editor/frame';
import { FrameCanvas } from '@/editor/FrameCanvas';
import { ActionRows, LevelSlider, Stepper } from '@/editor/AudioControls';
import {
  addFileClip,
  canLoopToFit,
  deleteAudioClip,
  FADE_STEP,
  filesOf,
  keepAddedSounds,
  MAX_FADE,
  moveAudioClip,
  originalClip,
  setClipDucking,
  setClipFades,
  setClipLoop,
  setClipVolume,
  setOriginalMuted,
  splitAudioClip,
  syncAudioToLength,
  trimAudioClip,
} from '@/editor/audioClips';
import { takeAddedClip, useClipBus } from '@/editor/clipBus';
import {
  appendClips,
  clipsOf,
  cutsOfClips,
  deleteClip,
  layoutOf,
  moveClip,
  orderOf,
  outputTotalOf,
  placeThumbs,
  projectClipsFrom,
  sourceDurationOf,
  timelineClipsOf,
  trimClipByDrag,
  trimOf,
  withAddedClips,
  wordCountsOf,
} from '@/editor/clips';
import { ActionBar, Panel, ToolBar, type ToolId } from '@/editor/Panel';
import { clearPreviewRequest, usePreviewBus } from '@/editor/previewBus';
import { regionsOf, Timeline, toSource, type Region, type TimelineSelection } from '@/editor/Timeline';
import { TextCanvas, type OverlayPatch } from '@/editor/TextCanvas';
import { copyOverlaysToBatch, isWholeClip, removeOverlay, retimeOverlay, setWholeClip, updateOverlay } from '@/editor/textOverlays';
import { overlayWindow } from '@/editor/textLayout';
import { restorableSec, trimClip } from '@/editor/trim';
import {
  captionText,
  editCaptionText,
  mergeCaption,
  resetCaptionEdits,
  retimeCaption,
  revertToOriginal as revertedDoc,
  setCaptionHidden,
  splitCaption,
  type EditResult,
} from '@/captions/edits';
import {
  Engine,
  EngineEvents,
  TenfoldPreviewView,
  type AddedAudio,
  type AddedClip,
  type Analysis,
  type AudioClip,
  type CaptionCard,
  type Cut,
  type EditDocument,
  type EditPlan,
  type FillerLevel,
  type SilenceLevel,
  type TenfoldPreviewViewRef,
  type ProjectClip,
  type TextOverlay,
  type Thumbnail,
  type ZoomMode,
} from '@/engine';
import { commitDoc, pinClipOrder, redoDoc, undoDoc, useEditHistory } from '@/state/history';
import { useSettings } from '@/state/settings';
import { docFromAnalysis, formatDuration, useLibrary } from '@/state/library';
import { tourTarget } from '@/tour/targets';

type Tool = Exclude<ToolId, 'captions' | 'text'> | null;

const TOOLS: { id: ToolId; icon: 'scissors' | 'text.quote' | 'captions.bubble' | 'textformat' | 'plus.magnifyingglass' | 'crop' | 'waveform'; label: string }[] = [
  { id: 'cuts', icon: 'scissors', label: 'Cuts' },
  { id: 'words', icon: 'text.quote', label: 'Words' },
  { id: 'captions', icon: 'captions.bubble', label: 'Captions' },
  { id: 'text', icon: 'textformat', label: 'Text' },
  { id: 'zoom', icon: 'plus.magnifyingglass', label: 'Zoom' },
  { id: 'crop', icon: 'crop', label: 'Frame' },
  { id: 'audio', icon: 'waveform', label: 'Audio' },
];

const ZOOMS: { v: ZoomMode; l: string }[] = [
  { v: 'off', l: 'Off' },
  { v: 'subtle', l: 'Subtle' },
  { v: 'dynamic', l: 'Dynamic' },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "14 s", "3.2 s": whole seconds once there are enough of them. */
const seconds = (s: number) => `${s >= 10 ? Math.round(s) : s.toFixed(1)} s`;

const SILENCE: { v: SilenceLevel; l: string }[] = [
  { v: 'off', l: 'Off' },
  { v: 'light', l: 'Light' },
  { v: 'medium', l: 'Medium' },
  { v: 'aggressive', l: 'Aggressive' },
];
const FILLERS: { v: FillerLevel; l: string }[] = [
  { v: 'off', l: 'Off' },
  { v: 'standard', l: 'Standard' },
  { v: 'aggressive', l: 'Aggressive' },
];

/**
 * Builds from before caption edits return cards without ids or hidden cards: fill them in the same way
 * the engine does ("w" + first word index) so selection keeps working until the app is rebuilt.
 */
const NO_CARDS: CaptionCard[] = [];
const NO_TEXTS: TextOverlay[] = [];
const NO_WAVES: Record<string, number[]> = {};
const NO_CLIPS: ProjectClip[] = [];
/** Most clips added from Photos at once. */
const MAX_ADD_CLIPS = 10;

/** "0.5 s" for fade lengths. */
const fadeLabel = (v: number) => `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/0$/, '')} s`;

function withCaptionIds(p: EditPlan): EditPlan {
  const fill = (c: CaptionCard): CaptionCard => (c.id ? c : { ...c, id: `w${c.words[0]?.index ?? 0}` });
  return { ...p, cards: p.cards.map(fill), hiddenCards: (p.hiddenCards ?? []).map(fill) };
}

/** Unique id for a cut the user makes (module scope: ids use the clock, which render code must not). */
function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export default function EditorScreen() {
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = useLibrary((s) => s.projects[projectId]);
  const doc = useLibrary((s) => s.docs[projectId]);
  const batch = useLibrary((s) => (project ? s.batches[project.batchId] : undefined));

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [thumbs, setThumbs] = useState<Thumbnail[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canUndo = useEditHistory((h) => (h.past[projectId]?.length ?? 0) > 0);
  const canRedo = useEditHistory((h) => (h.future[projectId]?.length ?? 0) > 0);
  const [tool, setTool] = useState<Tool>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  // Word whose spelling is being fixed in place (Words panel).
  const [editingWord, setEditingWord] = useState<number | null>(null);
  // Why Split / Delete didn't happen, shown under the timeline until the next edit or scrub.
  const [notice, setNotice] = useState<{ text: string; key: string } | null>(null);
  const [levelsError, setLevelsError] = useState<string | null>(null);
  // One selection at a time. A clip selection is tied to the document it was made on, so any edit (or
  // undo) clears it; a caption is selected by its stable id and stays selected through its own edits.
  const [selection, setSelection] = useState<
    | { kind: 'region'; region: Region; key: string }
    | { kind: 'caption'; id: string }
    | { kind: 'text'; id: string }
    | { kind: 'audio'; id: string }
    | { kind: 'clip'; id: string }
    | null
  >(null);
  // Clips being added: what the engine is doing, with a real percentage ("Transcribing clip 2… 40%").
  const [clipJob, setClipJob] = useState<string | null>(null);
  // Inline control open under a selected sound (Volume or Fade in its action bar).
  const [audioControl, setAudioControl] = useState<'volume' | 'fade' | null>(null);
  // Which "Add sound" row is waiting on a picker.
  const [adding, setAdding] = useState<'files' | 'photos' | null>(null);
  // This build's engine plays audio clips (older builds would ignore them in preview and export).
  const [audioEditable] = useState(() => Engine.canEditAudio());
  // This build's engine can add clips to a video (the "+" at the end of the timeline).
  const [canAddClips] = useState(() => Engine.canAddClips());
  const [waves, setWaves] = useState<Record<string, number[]>>(NO_WAVES);
  const requestedWaves = useRef(new Set<string>());
  // Caption group whose text is being retyped in place.
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  // Shape reported by the native preview, remembered with the aspect setting that produced it.
  const [rendered, setRendered] = useState<{ aspect: string; value: number; size: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Bumped each time the native preview finishes rendering a document (resets the live pinch transform).
  const [renderTick, setRenderTick] = useState(0);
  const levelsRequest = useRef(0);
  const preview = useRef<TenfoldPreviewViewRef>(null);
  const { width: screenW, height: screenH } = useWindowDimensions();

  // The video's clips (one for a video imported before multi-clip projects) and the order they play in.
  const projectClips = useMemo(() => (project ? clipsOf(project) : NO_CLIPS), [project]);
  const clipOrder = doc?.clipOrder;
  const layout = useMemo(() => layoutOf({ clipOrder }, projectClips), [clipOrder, projectClips]);
  const layoutDuration = layout.length ? layout[layout.length - 1].end : 0;
  const clipCount = projectClips.length;

  // Load the analysis (transcript, envelope) for the clips in play order. Reordering or deleting a clip
  // changes where every later word sits, so a new order loads it again.
  const orderKey = clipOrder ? JSON.stringify(clipOrder) : '';
  useEffect(() => {
    let alive = true;
    const order = orderKey ? (JSON.parse(orderKey) as string[]) : undefined;
    Engine.getAnalysis(projectId, order)
      .then((a) => alive && setAnalysis(a))
      .catch((e) => alive && setLoadError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [projectId, orderKey]);

  // Filmstrip frames for every clip (again when a clip is added). About one per 2 s (16–60).
  useEffect(() => {
    let alive = true;
    const seconds = useLibrary.getState().projects[projectId]?.media?.durationSec ?? 0;
    Engine.thumbnails(projectId, Math.round(Math.min(60, Math.max(16, clipCount * 4, seconds / 2))))
      .then((t) => alive && setThumbs(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId, clipCount]);
  // Frames placed where their clips play now.
  const placedThumbs = useMemo(() => placeThumbs(thumbs, layout), [thumbs, layout]);

  // The plan (keep segments, captions, zooms) always comes from the native planner.
  useEffect(() => {
    if (!doc || !analysis) return;
    let alive = true;
    const id = setTimeout(() => {
      Engine.plan(projectId, doc)
        .then((p) => alive && setPlan(withCaptionIds(p)))
        .catch(() => {});
    }, 60);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [doc, analysis, projectId]);

  const docJSON = useMemo(() => (doc ? JSON.stringify(doc) : ''), [doc]);
  // What the native preview renders: UI-only fields left out, so a split doesn't rebuild the player.
  // Text overlays are left out too: TextCanvas draws them over the preview (live while dragged) with the
  // engine's own layout numbers, and the export burns them in.
  const previewJSON = useMemo(() => {
    if (!doc) return '';
    const { splits: _splits, levels: _levels, textOverlays: _texts, ...rest } = doc;
    return JSON.stringify(rest);
  }, [doc]);

  // Editing pauses playback (like CapCut), so the frame under the playhead doesn't jump mid-play.
  // A change of cuts, clips or trims changes the output length: the sound follows in the same undo step.
  const commit = useCallback(
    (next: EditDocument) => {
      setPlaying(false);
      const { docs, projects } = useLibrary.getState();
      const prev = docs[projectId];
      const p = projects[projectId];
      const changed = !!prev && (prev.cuts !== next.cuts || prev.clipOrder !== next.clipOrder || prev.clipTrims !== next.clipTrims);
      if (!prev || !p || !changed) {
        commitDoc(projectId, next);
        return;
      }
      const clips = clipsOf(p);
      commitDoc(projectId, syncAudioToLength(next, outputTotalOf(prev, clips), outputTotalOf(next, clips)));
    },
    [projectId],
  );
  const undo = () => {
    setPlaying(false);
    undoDoc(projectId);
  };
  const redo = () => {
    setPlaying(false);
    redoDoc(projectId);
  };

  const words = useMemo(() => analysis?.transcript?.words ?? [], [analysis]);
  const overrides = useMemo(() => new Map((doc?.wordOverrides ?? []).map((o) => [o.wordIndex, o.text])), [doc]);

  // Word → the cut covering it (an applied cut wins over a suggestion), computed once per edit.
  const wordCuts = useMemo(() => {
    const cuts = doc?.cuts ?? [];
    return words.map((w) => {
      const mid = (w.start + w.end) / 2;
      const covering = cuts.filter((c) => c.start <= mid && c.end >= mid);
      return covering.find((c) => c.accepted) ?? covering[0];
    });
  }, [doc?.cuts, words]);
  const cutForWord = (i: number): Cut | undefined => wordCuts[i];

  const toggleWord = (i: number) => {
    if (!doc) return;
    const w = words[i];
    const existing = cutForWord(i);
    if (existing?.reason === 'manual' && existing.accepted) {
      // Restoring a word from a manual cut: drop the cut, or (for a deleted clip) open a gap just for this word.
      const pieces: Cut[] = [];
      if (w.start - 0.02 - existing.start > 0.05) pieces.push({ ...existing, id: newId('m'), end: w.start - 0.02 });
      if (existing.end - (w.end + 0.02) > 0.05) pieces.push({ ...existing, id: newId('m'), start: w.end + 0.02 });
      commit({ ...doc, cuts: [...doc.cuts.filter((c) => c.id !== existing.id), ...pieces] });
    } else if (existing) {
      commit({ ...doc, cuts: doc.cuts.map((c) => (c.id === existing.id ? { ...c, accepted: !c.accepted } : c)) });
    } else {
      const prevEnd = i > 0 ? words[i - 1].end : 0;
      const nextStart = i + 1 < words.length ? words[i + 1].start : w.end + 1;
      const cut: Cut = {
        id: newId(`m${i}`),
        start: Math.max(prevEnd, w.start - 0.03),
        end: Math.min(nextStart, w.end + 0.03),
        reason: 'manual',
        accepted: true,
        confidence: 1,
      };
      commit({ ...doc, cuts: [...doc.cuts, cut] });
    }
  };

  const startEditingWord = (i: number) => {
    setPlaying(false);
    setEditingWord(i);
  };

  // Saves a spelling fix typed in place. Empty (or the transcribed spelling) shows the transcribed word.
  const saveWord = (i: number, raw: string) => {
    setEditingWord(null);
    const latest = useLibrary.getState().docs[projectId];
    const original = words[i]?.text;
    if (!latest || original == null) return;
    const text = raw.trim();
    const before = latest.wordOverrides.find((o) => o.wordIndex === i)?.text;
    const after = text === '' || text === original ? undefined : text;
    if (before === after) return;
    const rest = latest.wordOverrides.filter((o) => o.wordIndex !== i);
    commit({ ...latest, wordOverrides: after == null ? rest : [...rest, { wordIndex: i, text: after }] });
  };

  const sourceAt = (comp: number) => {
    const segs = plan?.segments ?? [];
    for (const s of segs) if (comp <= s.compEnd) return s.start + Math.max(0, comp - s.compStart);
    return segs.length ? segs[segs.length - 1].end : 0;
  };
  const srcTime = sourceAt(time);
  const activeWord = words.findIndex((w) => srcTime >= w.start && srcTime <= w.end);

  // Scrubbing: the native view keeps only the newest seek target while one is in flight, so send every move.
  const onScrubStart = useCallback(() => {
    setPlaying(false);
    setNotice(null);
  }, []);
  const onScrub = useCallback((t: number) => {
    setTime(t);
    preview.current?.seek(t).catch(() => {});
  }, []);
  const onScrubEnd = useCallback((t: number) => {
    setTime(t);
    preview.current?.seek(t).catch(() => {});
  }, []);

  const segments = useMemo(() => plan?.segments ?? [], [plan]);
  // User splits (source time) → composition time, keeping only those inside a kept segment.
  const compSplits = useMemo(() => {
    const out: number[] = [];
    for (const src of doc?.splits ?? []) {
      const seg = segments.find((g) => src > g.start + 0.1 && src < g.end - 0.1);
      if (seg) out.push(seg.compStart + (src - seg.start));
    }
    return out;
  }, [doc?.splits, segments]);
  // The clips on the strip (composition time) when the video has more than one; their starts are edit points.
  const timelineClips = useMemo(() => (layout.length > 1 ? timelineClipsOf(layout, segments) : null), [layout, segments]);
  const editPoints = useMemo(() => [...compSplits, ...(timelineClips ?? []).slice(1).map((c) => c.start)], [compSplits, timelineClips]);
  const selectedClip = selection?.kind === 'clip' ? (timelineClips?.find((c) => c.id === selection.id) ?? null) : null;
  const selectedClipId = selectedClip?.id ?? null;
  const wordCounts = useMemo(() => wordCountsOf(analysis), [analysis]);
  const selected = selection?.kind === 'region' && selection.key === docJSON ? selection.region : null;
  // Every caption group in time order, hidden ones included (they stay selectable so they can be shown).
  const allCards = useMemo(() => [...(plan?.cards ?? []), ...(plan?.hiddenCards ?? [])].sort((a, b) => a.start - b.start), [plan]);
  const hiddenIds = useMemo(() => new Set((plan?.hiddenCards ?? []).map((c) => c.id)), [plan]);
  const selectedCard = selection?.kind === 'caption' ? (allCards.find((c) => c.id === selection.id) ?? null) : null;
  // The React Compiler (app.json) memoises this, so playback ticks don't re-render the timeline's tracks.
  const selectedCardId = selectedCard?.id ?? null;
  const texts = doc?.textOverlays ?? NO_TEXTS;
  const selectedText = selection?.kind === 'text' ? (texts.find((o) => o.id === selection.id) ?? null) : null;
  const selectedTextId = selectedText?.id ?? null;
  // The sound as clips (a document without audioClips plays one original clip; see src/editor/audioClips.ts).
  const compTotal = plan?.compDuration ?? 0;
  const storedAudio = doc?.audioClips;
  const audioClips = useMemo(
    () => (audioEditable && compTotal > 0 ? (storedAudio ?? [originalClip(compTotal)]) : null),
    [audioEditable, storedAudio, compTotal],
  );
  const selectedAudio = selection?.kind === 'audio' ? (audioClips?.find((c) => c.id === selection.id) ?? null) : null;
  const selectedAudioId = selectedAudio?.id ?? null;
  const nothingSelected = !selectedCard && !selectedText && !selectedAudio && !selectedClip;

  // Waveforms of added sounds, fetched once per file.
  const soundFiles = useMemo(() => filesOf(storedAudio ?? []).filter((c) => !!c.file), [storedAudio]);
  useEffect(() => {
    for (const c of soundFiles) {
      const file = c.file!;
      if (requestedWaves.current.has(file)) continue;
      requestedWaves.current.add(file);
      const buckets = Math.round(Math.min(6000, Math.max(50, (c.fileDuration ?? 60) * 20)));
      Engine.audioWaveform(projectId, file, buckets)
        .then((levels) => setWaves((w) => ({ ...w, [file]: levels })))
        .catch(() => {});
    }
  }, [soundFiles, projectId]);

  const timelineSelection: TimelineSelection = selected
    ? { kind: 'region', region: selected }
    : selectedClipId
      ? { kind: 'clip', id: selectedClipId }
      : selectedCardId
        ? { kind: 'caption', id: selectedCardId }
        : selectedTextId
          ? { kind: 'text', id: selectedTextId }
          : selectedAudioId
            ? { kind: 'audio', id: selectedAudioId }
            : null;
  const onSelect = useCallback(
    (s: TimelineSelection) => {
      setEditingCaption(null);
      setNotice(null);
      setAudioControl(null);
      if (!s) setSelection(null);
      else if (s.kind === 'region') setSelection({ kind: 'region', region: s.region, key: docJSON });
      else {
        setPlaying(false);
        setSelection({ kind: s.kind, id: s.id });
      }
    },
    [docJSON],
  );

  // Removed footage next to the selected part's ends: how far each end can be dragged outward.
  const restorable = useMemo(() => {
    const dur = layoutDuration || plan?.compDuration || 0;
    if (!selected) return { start: 0, end: 0 };
    return { start: restorableSec(segments, selected, 'start', dur), end: restorableSec(segments, selected, 'end', dur) };
  }, [selected, segments, layoutDuration, plan?.compDuration]);
  // A selected clip's ends drag outward as far as it was trimmed.
  const clipRestorable = useMemo(() => (selectedClipId && doc ? trimOf(doc, selectedClipId) : { head: 0, tail: 0 }), [selectedClipId, doc]);

  const onTrimRegion = useCallback(
    (region: Region, side: 'start' | 'end', delta: number) => {
      const { docs, projects } = useLibrary.getState();
      const latest = docs[projectId];
      const p = projects[projectId];
      if (!latest || !p) return false;
      const dur = sourceDurationOf(latest, clipsOf(p)) || plan?.compDuration || 0;
      const next = trimClip(latest, segments, region, side, delta, dur, newId);
      if (!next) return false;
      commit(next);
      setSelection(null);
      return true;
    },
    [projectId, segments, plan?.compDuration, commit],
  );

  const onRetimeCaption = useCallback(
    (card: CaptionCard, edge: { start?: number; end?: number }) => {
      const latest = useLibrary.getState().docs[projectId];
      if (!latest) return false;
      commit(retimeCaption(latest, card, segments, edge));
      return true;
    },
    [projectId, segments, commit],
  );

  const onRetimeText = useCallback(
    (id: string, edge: { start?: number; end?: number }) => {
      const latest = useLibrary.getState().docs[projectId];
      if (!latest || !plan) return false;
      const next = retimeOverlay(latest, id, edge, plan.compDuration);
      if (!next) return false;
      commit(next);
      return true;
    },
    [projectId, plan, commit],
  );

  const onRetimeAudio = useCallback(
    (id: string, edge: { start?: number; end?: number }) => {
      const latest = useLibrary.getState().docs[projectId];
      if (!latest || !plan) return false;
      const next = trimAudioClip(latest, id, edge, plan.compDuration);
      if (!next) return false;
      commit(next);
      return true;
    },
    [projectId, plan, commit],
  );

  const onMoveAudio = useCallback(
    (id: string, start: number) => {
      const latest = useLibrary.getState().docs[projectId];
      if (!latest || !plan) return false;
      const next = moveAudioClip(latest, id, start, plan.compDuration);
      if (!next) return false;
      commit(next);
      return true;
    },
    [projectId, plan, commit],
  );

  // Clips (videos made of several): tap selects a clip, a second tap the part under the finger.
  const onTapClip = (id: string, compTime: number | null) => {
    setEditingCaption(null);
    setNotice(null);
    setAudioControl(null);
    setPlaying(false);
    const clip = timelineClips?.find((c) => c.id === id);
    if (!clip) return;
    const inClip = (r: Region) => r.start >= clip.start - 1e-3 && r.end <= clip.end + 1e-3;
    const drill = compTime !== null && (selectedClipId === id || (!!selected && inClip(selected)));
    if (!drill) {
      setSelection({ kind: 'clip', id });
      return;
    }
    const part = regionsOf(segments, editPoints, plan?.compDuration ?? 0).find((r) => compTime >= r.start && compTime <= r.end && inClip(r));
    const same = !!part && !!selected && Math.abs(selected.start - part.start) < 1e-3 && Math.abs(selected.end - part.end) < 1e-3;
    if (!part || same) {
      setSelection({ kind: 'clip', id });
      return;
    }
    setSelection({ kind: 'region', region: part, key: docJSON });
  };

  // Commits a clip edit and says (in place) when caption edits had to go with it.
  const commitClipEdit = (latest: EditDocument, next: EditDocument, what: string) => {
    commit(next);
    const saved = useLibrary.getState().docs[projectId];
    if (latest.captionEdits && !next.captionEdits && saved) {
      setNotice({ text: `${what} Caption edits were reset because the words moved. Undo brings them back.`, key: JSON.stringify(saved) });
    }
  };

  const onReorderClip = (id: string, beforeId: string | null) => {
    const { docs, projects } = useLibrary.getState();
    const latest = docs[projectId];
    const p = projects[projectId];
    if (!latest || !p) return false;
    const rest = orderOf(latest, clipsOf(p)).filter((x) => x !== id);
    const to = beforeId ? rest.indexOf(beforeId) : rest.length;
    if (to < 0) return false;
    const next = moveClip(latest, clipsOf(p), id, to, wordCounts);
    if (!next) return false;
    commitClipEdit(latest, next, 'Clip moved.');
    setSelection({ kind: 'clip', id });
    return true;
  };

  const onTrimClip = (id: string, side: 'start' | 'end', delta: number) => {
    const { docs, projects } = useLibrary.getState();
    const latest = docs[projectId];
    const p = projects[projectId];
    if (!latest || !p) return false;
    const next = trimClipByDrag(latest, clipsOf(p), segments, id, side, delta);
    if (!next) return false;
    commit(next);
    return true;
  };

  const deleteSelectedClip = () => {
    if (selectedClip) deleteWholeClip(selectedClip);
  };

  // Takes a clip out of the video (asks first when someone speaks in it).
  const deleteWholeClip = (clip: { id: string; title: string; start: number }) => {
    const { id, title, start } = clip;
    const run = () => {
      const { docs, projects } = useLibrary.getState();
      const latest = docs[projectId];
      const p = projects[projectId];
      if (!latest || !p) return;
      const r = deleteClip(latest, clipsOf(p), id, wordCounts);
      if ('error' in r) {
        setNotice({ text: r.error, key: docJSON });
        return;
      }
      commitClipEdit(latest, r.doc, 'Clip deleted.');
      setSelection(null);
      const end = outputTotalOf(r.doc, clipsOf(p));
      const t = Math.min(start, Math.max(0, end - 0.05));
      setTime(t);
      preview.current?.seek(t).catch(() => {});
    };
    const spoken = wordCounts[id] ?? 0;
    if (spoken === 0) {
      run();
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        // The editor is dark while the app's chrome is light: match its sheets to the screen.
        userInterfaceStyle: 'dark',
        options: ['Delete clip', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
        title,
        message: `This clip has ${plural(spoken, 'spoken word', 'spoken words')}. Undo brings it back.`,
      },
      (i) => {
        if (i === 0) run();
      },
    );
  };

  // Adding clips: copy in (engine), analyse only the new clips, then put them at the end in one undo step.
  const addedClips = async (added: AddedClip[]) => {
    const failed = added.filter((a) => a.error && a.error !== 'cancelled');
    const fresh = projectClipsFrom(added);
    const p = useLibrary.getState().projects[projectId];
    const current = useLibrary.getState().docs[projectId];
    if (!fresh.length || !p || !current) {
      if (failed.length) {
        const text = failed[0].error === 'unavailable' ? 'This build of Tenfold can’t add clips. Install the latest build.' : `Couldn’t add the clip: ${failed[0].error}`;
        setNotice({ text, key: JSON.stringify(current) });
      }
      return;
    }
    const all = withAddedClips(p, fresh);
    const ids = fresh.map((c) => c.id);
    const before = orderOf(current, clipsOf(p));
    useLibrary.getState().updateProject(projectId, {
      clips: all,
      media: p.media ? { ...p.media, durationSec: all.reduce((sum, c) => sum + c.durationSec, 0) } : p.media,
    });
    const first = before.length + 1;
    setClipJob(fresh.length > 1 ? `Reading clips ${first}–${first + fresh.length - 1}…` : `Reading clip ${first}…`);
    const sub = EngineEvents.onJobProgress((e) => {
      if (e.projectId !== projectId || e.scope !== 'clips') return;
      const label = STAGE_LABELS[e.stage] ?? 'Analysing';
      setClipJob(`${label} clip ${first + (e.clipIndex ?? 0)}… ${Math.round(stageProgress(e.stage, e.fraction) * 100)}%`);
    });
    try {
      const fallback = { silence: 'medium' as const, fillers: 'standard' as const, retakes: true };
      const levels = current.levels ?? (batch ? effectiveLevels(batch.preset, editsOf(p, batch)) : fallback);
      await Engine.analyze(
        projectId,
        { silence: levels.silence, fillers: levels.fillers, retakes: levels.retakes ?? true, language: useSettings.getState().language },
        ids,
      );
      const a = await Engine.getAnalysis(projectId, [...before, ...ids]);
      const latest = useLibrary.getState().docs[projectId];
      const next = latest ? appendClips(latest, all, ids, cutsOfClips(a, ids)) : null;
      if (next) {
        commit(next);
        setSelection({ kind: 'clip', id: ids[0] });
      }
      if (failed.length) {
        setNotice({ text: `${plural(failed.length, 'clip', 'clips')} couldn’t be added: ${failed[0].error}`, key: JSON.stringify(useLibrary.getState().docs[projectId]) });
      }
    } catch (e) {
      // Nothing uses the new clips yet: take them out again.
      ids.forEach((id) => Engine.removeClipFile(projectId, id).catch(() => {}));
      const now = useLibrary.getState().projects[projectId];
      if (now) {
        const left = clipsOf(now).filter((c) => !ids.includes(c.id));
        useLibrary.getState().updateProject(projectId, {
          clips: left,
          media: now.media ? { ...now.media, durationSec: left.reduce((sum, c) => sum + c.durationSec, 0) } : now.media,
        });
      }
      setNotice({ text: `Couldn’t add the clip: ${errorText(e)}`, key: JSON.stringify(useLibrary.getState().docs[projectId]) });
    } finally {
      sub.remove();
      setClipJob(null);
    }
  };

  // Before the first clip is added, the order is written down, so undo can take a new clip out again.
  const pinOrder = () => {
    const { docs, projects } = useLibrary.getState();
    const latest = docs[projectId];
    const p = projects[projectId];
    if (latest && p && !latest.clipOrder) pinClipOrder(projectId, orderOf(latest, clipsOf(p)));
  };

  const pickClips = async (from: 'photos' | 'files') => {
    pinOrder();
    let added: AddedClip[];
    const sub =
      from === 'photos'
        ? EngineEvents.onImportProgress(({ index, total }) => {
            if (total > 0 && index < total) setClipJob(`Copying clip ${index + 1} of ${total}…`);
          })
        : null;
    try {
      added = from === 'photos' ? await Engine.pickClips(projectId, MAX_ADD_CLIPS) : [await Engine.pickVideoFile(projectId)];
    } catch (e) {
      added = [{ error: errorText(e) }];
    } finally {
      sub?.remove();
      setClipJob(null);
    }
    await addedClips(added);
  };

  const openAddClip = () => {
    setPlaying(false);
    setNotice(null);
    if (clipJob) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['From Photos', 'Record a clip', 'From Files', 'Cancel'],
        cancelButtonIndex: 3,
        title: 'Add a clip to the end',
        userInterfaceStyle: 'dark',
      },
      (i) => {
        if (i === 0) void pickClips('photos');
        else if (i === 2) void pickClips('files');
        else if (i === 1) {
          pinOrder();
          router.push({ pathname: '/record', params: { projectId } });
        }
      },
    );
  };

  // A recording made for this video: the camera screen hands it over as it closes.
  const addedClipsRef = useRef(addedClips);
  useEffect(() => {
    addedClipsRef.current = addedClips;
  });
  useEffect(() => {
    const take = () => {
      const added = takeAddedClip(projectId);
      if (added) void addedClipsRef.current([added]);
    };
    take();
    return useClipBus.subscribe(take);
  }, [projectId]);

  // Sound actions. Each reads the saved document, so it is one undo step.
  const editAudio = (make: (latest: EditDocument, total: number) => EditDocument | null) => {
    const latest = useLibrary.getState().docs[projectId];
    if (!latest || !plan) return;
    const next = make(latest, plan.compDuration);
    if (next) commit(next);
  };
  const splitAudioAtPlayhead = () => {
    const latest = useLibrary.getState().docs[projectId];
    if (!latest || !plan || !selectedAudio) return;
    const r = splitAudioClip(latest, selectedAudio.id, time, plan.compDuration, () => newId('s'));
    if ('error' in r) setNotice({ text: r.error, key: docJSON });
    else commit(r.doc);
  };
  const deleteAudio = (id: string) => {
    editAudio((d, t) => deleteAudioClip(d, id, t));
    setSelection(null);
    setAudioControl(null);
  };

  // Adds a sound from Files or from a video in Photos at the playhead. Music ducks under speech.
  const addSound = async (from: 'files' | 'photos') => {
    setPlaying(false);
    setNotice(null);
    setAdding(from);
    let added: AddedAudio;
    try {
      added = from === 'files' ? await Engine.pickAudioFile(projectId) : await Engine.extractAudio(projectId);
    } catch (e) {
      added = { error: errorText(e) };
    } finally {
      setAdding(null);
    }
    if (added.error === 'cancelled') return;
    const latest = useLibrary.getState().docs[projectId];
    const total = planRef.current?.compDuration ?? 0;
    if (added.error || !latest || !total) {
      const text =
        added.error === 'noAudio'
          ? 'That video has no sound. Pick another one.'
          : added.error === 'unavailable'
            ? 'This build of Tenfold can’t add sounds. Install the latest build.'
            : `Couldn’t add the sound: ${added.error ?? 'the video isn’t ready.'}`;
      // A file copied in that no clip will use.
      if (added.file) Engine.deleteAudioFile(projectId, added.file).catch(() => {});
      setNotice({ text, key: JSON.stringify(latest) });
      return;
    }
    const id = newId('s');
    const r = addFileClip(latest, added, timeRef.current, total, { id, ducking: true });
    if ('error' in r) {
      if (added.file) Engine.deleteAudioFile(projectId, added.file).catch(() => {});
      setNotice({ text: r.error, key: JSON.stringify(latest) });
      return;
    }
    commit(r.doc);
    setTool(null);
    setSelection({ kind: 'audio', id });
  };

  const openVoiceover = () => {
    setPlaying(false);
    const total = plan?.compDuration ?? 0;
    if (time > total - 0.3) {
      setNotice({ text: 'Move the playhead back from the end to record over the video.', key: docJSON });
      return;
    }
    router.push({ pathname: '/editor/voiceover', params: { projectId, at: String(time), total: String(total) } });
  };

  // Caption actions (contextual tool bar). Each reads the saved document, so it is one undo step.
  const applyCaptionEdit = (result: EditResult) => {
    if ('error' in result) setNotice({ text: result.error, key: docJSON });
    else commit(result.doc);
  };
  const nextCard = (card: CaptionCard) => allCards[allCards.indexOf(card) + 1];
  const splitCaptionAtPlayhead = () => {
    const latest = useLibrary.getState().docs[projectId];
    if (!latest || !selectedCard) return;
    applyCaptionEdit(splitCaption(latest, selectedCard, nextCard(selectedCard), words, time));
  };
  const mergeCaptionWithNext = () => {
    const latest = useLibrary.getState().docs[projectId];
    if (!latest || !selectedCard) return;
    applyCaptionEdit(mergeCaption(latest, selectedCard, nextCard(selectedCard), words));
  };
  const toggleCaptionHidden = () => {
    const latest = useLibrary.getState().docs[projectId];
    if (!latest || !selectedCard) return;
    commit(setCaptionHidden(latest, selectedCard.id, !hiddenIds.has(selectedCard.id)));
  };
  const saveCaptionText = (card: CaptionCard, raw: string) => {
    setEditingCaption(null);
    const latest = useLibrary.getState().docs[projectId];
    if (!latest) return;
    const next = editCaptionText(latest, card, raw, words);
    if (next) commit(next);
  };

  // "Play 3 s" in the captions sheet: from the first caption, for that long.
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  // The playhead when a picker returns (it may have been open a while).
  const timeRef = useRef(time);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = usePreviewBus.subscribe((s) => {
      const request = s.request;
      if (!request) return;
      clearPreviewRequest();
      if (request.kind === 'play') {
        // The voiceover sheet: play from where recording starts, pause when it stops.
        if (timer) clearTimeout(timer);
        if (request.at !== undefined) {
          setTime(request.at);
          preview.current?.seek(request.at).catch(() => {});
        }
        setPlaying(request.playing);
        return;
      }
      const t = planRef.current?.cards[0]?.start ?? 0;
      setTime(t);
      preview.current?.seek(t).catch(() => {});
      setPlaying(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPlaying(false), request.seconds * 1000);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Text overlays: the TikTok-style editor is its own full-screen route over a still of this frame.
  const openTextEditor = (overlayId?: string, focus?: 'style') => {
    setPlaying(false);
    // The filmstrip frame nearest the playhead, as the backdrop to type over.
    const src = sourceAt(time);
    let poster: string | undefined = project?.posterUri ?? undefined;
    let best = Infinity;
    for (const t of placedThumbs) {
      const d = Math.abs(t.time - src);
      if (d < best) {
        best = d;
        poster = t.uri;
      }
    }
    // The output's shape, as the preview frame is sized (below).
    const a = aspectOf(useLibrary.getState().docs[projectId]?.crop ?? { auto916: true });
    const ratio = rendered && rendered.aspect === a ? rendered.value : aspectRatioValue(a, project?.media ?? undefined);
    const params: { projectId: string; ratio: string; overlayId?: string; poster?: string; focus?: string } = { projectId, ratio: String(ratio) };
    if (overlayId) params.overlayId = overlayId;
    if (poster) params.poster = poster;
    if (focus) params.focus = focus;
    router.push({ pathname: '/editor/text', params });
  };
  const onGrabText = (id: string) => {
    setPlaying(false);
    setNotice(null);
    setEditingCaption(null);
    setSelection({ kind: 'text', id });
  };
  const onOpenText = (id: string) => {
    setSelection({ kind: 'text', id });
    openTextEditor(id);
  };
  const onCommitText = (id: string, patch: OverlayPatch) => {
    const latest = useLibrary.getState().docs[projectId];
    const next = latest ? updateOverlay(latest, id, patch) : null;
    if (!next) return false;
    commit(next);
    return true;
  };
  const deleteText = (id: string) => {
    const latest = useLibrary.getState().docs[projectId];
    const next = latest ? removeOverlay(latest, id) : null;
    if (next) commit(next);
    setSelection(null);
  };
  const textWholeClip = (id: string) => {
    const latest = useLibrary.getState().docs[projectId];
    const next = latest ? setWholeClip(latest, id) : null;
    if (next) commit(next);
  };

  // Same text on every other clip of the batch (replacing theirs); one undo step per clip.
  const copyTextToBatch = () => {
    if (!batch) return;
    const { docs } = useLibrary.getState();
    const copies = copyOverlaysToBatch(docs, projectId, batch.projectIds, () => newId('t'));
    const ids = Object.keys(copies);
    ids.forEach((pid) => commitDoc(pid, copies[pid]));
    const n = docs[projectId]?.textOverlays?.length ?? 0;
    setNotice({
      text: ids.length ? `Copied ${plural(n, 'text', 'texts')} to ${plural(ids.length, 'other clip', 'other clips')}.` : 'No other clip in this batch is ready to edit yet.',
      key: docJSON,
    });
  };

  const splitAtPlayhead = () => {
    if (!doc) return;
    const seg = segments.find((g) => time > g.compStart + 0.15 && time < g.compEnd - 0.15);
    if (!seg || editPoints.some((c) => Math.abs(c - time) < 0.15)) {
      setNotice({ text: 'Can’t split here. Move the playhead inside a clip, away from its edges.', key: docJSON });
      return;
    }
    setPlaying(false);
    commit({ ...doc, splits: [...(doc.splits ?? []), seg.start + (time - seg.compStart)] });
  };

  const splitClipAtPlayhead = () => {
    if (!selectedClip) return;
    if (time <= selectedClip.start + 0.15 || time >= selectedClip.end - 0.15) {
      setNotice({ text: 'Move the playhead inside this clip, away from its ends, to split it.', key: docJSON });
      return;
    }
    splitAtPlayhead();
  };

  const deleteSelected = () => {
    if (!doc || !selected || !plan) return;
    // A part that is a whole clip goes as the clip (a cut over all of it would leave an empty clip behind).
    const whole = timelineClips?.find((c) => Math.abs(c.start - selected.start) < 1e-3 && Math.abs(c.end - selected.end) < 1e-3);
    if (whole) {
      setSelection(null);
      deleteWholeClip(whole);
      return;
    }
    if (regionsOf(segments, editPoints, plan.compDuration).length <= 1) {
      setNotice({ text: 'Can’t delete the whole video. Split it first, then delete the part you don’t want.', key: docJSON });
      return;
    }
    const start = toSource(segments, selected.start + 1e-4);
    const end = toSource(segments, selected.end - 1e-4);
    setPlaying(false);
    commit({
      ...doc,
      cuts: [...doc.cuts, { id: newId('d'), start, end, reason: 'manual', accepted: true, confidence: 1 }],
    });
    setSelection(null);
    const t = Math.min(selected.start, Math.max(0, plan.compDuration - (selected.end - selected.start) - 0.05));
    setTime(t);
    preview.current?.seek(t).catch(() => {});
  };

  const applyLevels = async (next: { silence: SilenceLevel; fillers: FillerLevel; retakes?: boolean }) => {
    // Only the newest tap wins, and it applies to the document as it is when the result arrives.
    const request = ++levelsRequest.current;
    try {
      // Detected clip by clip, for the clips in play order.
      const suggested = await Engine.suggestCuts(
        projectId,
        {
          silence: next.silence,
          fillers: next.fillers,
          retakes: next.retakes ?? true,
          language: analysis?.transcript?.language ?? 'auto',
        },
        useLibrary.getState().docs[projectId]?.clipOrder,
      );
      const latest = useLibrary.getState().docs[projectId];
      if (request !== levelsRequest.current || !latest) return;
      setLevelsError(null);
      commit({ ...latest, levels: next, cuts: [...latest.cuts.filter((c) => c.reason === 'manual'), ...suggested] });
    } catch (e) {
      if (request === levelsRequest.current) setLevelsError(`Couldn’t update cuts: ${errorText(e)} Try the level again.`);
    }
  };

  // Details live in a form sheet; the output size is only known here, from the live preview.
  const showInfo = () => {
    const params: { projectId: string; frame?: string; aspect?: string } = { projectId };
    if (rendered) {
      params.frame = rendered.size;
      params.aspect = rendered.aspect;
    }
    router.push({ pathname: '/editor/info', params });
  };

  // Back to the untouched clip: no cuts, captions (edits and style changes too), zoom or reframing.
  // One undoable step (src/captions/edits.ts).
  const revertToOriginal = () => {
    const latest = useLibrary.getState().docs[projectId];
    if (!latest) return;
    setSelection(null);
    commit(revertedDoc(latest));
  };

  // Split / merge / hide / retime on captions go; the caption style and spelling fixes stay.
  const resetCaptions = () => {
    const latest = useLibrary.getState().docs[projectId];
    if (!latest?.captionEdits) return;
    commit(resetCaptionEdits(latest));
  };

  // Tenfold's edit for this video again, from its analysis and the edits checked for it.
  // Text the user placed is theirs, not part of Tenfold's edit: it stays.
  const reapplyEdit = () => {
    if (!doc || !analysis || !batch || !project) return;
    // The clips, their order and trims are the user's; the analysis is already in that order.
    const base: EditDocument = { ...docFromAnalysis(analysis, batch, editsOf(project, batch)), wordOverrides: doc.wordOverrides };
    if (doc.clipOrder) base.clipOrder = doc.clipOrder;
    if (doc.clipTrims) base.clipTrims = doc.clipTrims;
    // Added sounds are the user's too; the original sound comes back whole (then trims shorten it).
    const untrimmed = keepAddedSounds(base, doc, layoutDuration || analysis.media.durationSec);
    const fresh = syncAudioToLength(untrimmed, outputTotalOf({ ...untrimmed, clipTrims: undefined }, projectClips), outputTotalOf(untrimmed, projectClips));
    // Straight to history: the sound was just fitted to the new cuts.
    setPlaying(false);
    commitDoc(projectId, doc.textOverlays ? { ...fresh, textOverlays: doc.textOverlays } : fresh);
  };

  const openMenu = () => {
    setPlaying(false);
    // "Reset caption edits" only when there are some (split, merge, hide or retime).
    const hasCaptionEdits = !!useLibrary.getState().docs[projectId]?.captionEdits;
    // "Copy text" only with text to copy and other clips in the batch to copy it to.
    const canCopyText = !!useLibrary.getState().docs[projectId]?.textOverlays?.length && (batch?.projectIds.length ?? 0) > 1;
    const items: { title: string; run: () => void }[] = [
      { title: 'Revert to original', run: revertToOriginal },
      { title: 'Re-apply Tenfold’s edit', run: reapplyEdit },
      ...(hasCaptionEdits ? [{ title: 'Reset caption edits', run: resetCaptions }] : []),
      ...(canCopyText ? [{ title: 'Copy text to all clips in batch', run: copyTextToBatch }] : []),
      { title: 'Video info', run: showInfo },
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        // The editor is dark while the app's chrome is light: match its sheets to the screen.
        userInterfaceStyle: 'dark',
        options: [...items.map((o) => o.title), 'Cancel'],
        cancelButtonIndex: items.length,
        destructiveButtonIndex: 0,
        title: project?.title,
        message: 'Undo reverses these edits.',
      },
      (i) => items[i]?.run(),
    );
  };

  if (!project) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Background />
        <AppText variant="bodyStrong">This video was deleted.</AppText>
        <OutlineButton title="Go back" height={44} onPress={() => router.back()} />
      </View>
    );
  }

  if (!doc || !analysis) {
    const stillWorking = ['queued', 'analyzing'].includes(project.status);
    if (doc && !loadError) {
      // The layout is known: show its shape while the analysis loads.
      const skeletonH = Math.min(460, screenH * 0.46);
      const skeletonAspect = aspectRatioValue(aspectOf(doc.crop), project.media ?? undefined);
      return (
        <View style={[styles.flex, { paddingTop: insets.top + 4 }]}>
          <Background />
          <View style={styles.gutter}>
            <ScreenHeader title={project.title} />
          </View>
          <View style={[styles.gutter, styles.previewSlot, { height: skeletonH }]}>
            <View style={[styles.bone, { width: Math.min(screenW - spacing.gutter * 2, skeletonH * skeletonAspect), aspectRatio: skeletonAspect }]} />
          </View>
          <View style={[styles.gutter, styles.skeletonTools]}>
            {TOOLS.map((t) => (
              <View key={t.id} style={[styles.bone, styles.skeletonTool]} />
            ))}
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.flex, styles.center, { paddingTop: insets.top }]}>
        <Background />
        {loadError || (!doc && !stillWorking) ? (
          <>
            <AppText variant="bodyStrong">This video isn’t ready to edit.</AppText>
            <AppText variant="label" color={dark.textSecondary} style={styles.centerText}>
              {loadError ?? project.error ?? 'Run the batch first.'}
            </AppText>
          </>
        ) : (
          <>
            <ActivityIndicator color={dark.textPrimary} />
            <AppText variant="label" color={dark.textSecondary}>
              Still analysing this clip.
            </AppText>
          </>
        )}
        <OutlineButton title="Go back" height={44} onPress={() => router.back()} />
      </View>
    );
  }

  // Suggestions Tenfold wasn't sure enough about to apply: possible fillers and possible retakes.
  const fillerCandidates = doc.cuts.filter((c) => !c.accepted && c.reason === 'filler' && c.confidence < 0.9);
  const retakeCandidates = doc.cuts.filter((c) => !c.accepted && c.reason === 'retake');
  const candidates = [...fillerCandidates, ...retakeCandidates];
  const acceptedFillers = doc.cuts.filter((c) => c.accepted && c.reason === 'filler').length;
  const acceptedPauses = doc.cuts.filter((c) => c.accepted && c.reason === 'silence').length;
  const acceptedRetakes = doc.cuts.filter((c) => c.accepted && c.reason === 'retake').length;
  const acceptedManual = doc.cuts.filter((c) => c.accepted && c.reason === 'manual').length;
  const anyAccepted = acceptedFillers + acceptedPauses + acceptedRetakes + acceptedManual > 0;
  const total = plan?.compDuration ?? project.media?.durationSec ?? 0;
  const muted = doc.audio.mode === 'mute';
  const aspect = aspectOf(doc.crop);
  // Size the preview frame to the output's shape so there are no bars around the video.
  const frameAspect = rendered && rendered.aspect === aspect ? rendered.value : aspectRatioValue(aspect, project.media ?? undefined);
  const maxW = screenW - spacing.gutter * 2;
  // While a word is being retyped the preview shrinks, so the Words panel stays visible above the keyboard.
  const maxH = editingWord != null || editingCaption != null ? 120 : Math.min(460, screenH * 0.46);
  const frameW = Math.round(Math.min(maxW, maxH * frameAspect));
  const frameH = Math.round(frameW / frameAspect);
  // Manual placement on the canvas (see src/editor/frame.ts). Automatic framing reads as Fill.
  const media = project.media;
  const vW = media?.width || 9;
  const vH = media?.height || 16;
  const outRatio = aspectRatioValue(aspect, media ?? undefined);
  const fillScale = fillUserScale(outRatio, 1, vW, vH);
  const manual = doc.crop.scale != null;
  const placement: Placement = manual
    ? { scale: doc.crop.scale ?? 1, offsetX: doc.crop.offsetX ?? 0, offsetY: doc.crop.offsetY ?? 0 }
    : { scale: fillScale, offsetX: 0, offsetY: 0 };
  const centred = Math.abs(placement.offsetX) < 1e-3 && Math.abs(placement.offsetY) < 1e-3;
  const frameMode = !manual ? 'auto' : centred && Math.abs(placement.scale - 1) < 1e-3 ? 'fit' : centred && Math.abs(placement.scale - fillScale) < 1e-3 ? 'fill' : 'custom';
  const setFrame = (mode: 'fit' | 'fill' | 'auto') =>
    commit({
      ...doc,
      crop:
        mode === 'auto'
          ? { auto916: aspect === '9:16', aspect }
          : { auto916: aspect === '9:16', aspect, scale: mode === 'fit' ? 1 : fillScale, offsetX: 0, offsetY: 0 },
      zoom: mode === 'auto' ? { ...doc.zoom, faceFollow: true } : doc.zoom,
    });
  const commitPlacement = (p: Placement) => {
    // Pinch and pan can both end on one lift; compare with the saved document, not this render's copy.
    const latest = useLibrary.getState().docs[projectId];
    if (!latest) return;
    const c = latest.crop;
    if (c.scale === p.scale && (c.offsetX ?? 0) === p.offsetX && (c.offsetY ?? 0) === p.offsetY) return;
    commit({ ...latest, crop: { auto916: aspect === '9:16', aspect, scale: p.scale, offsetX: p.offsetX, offsetY: p.offsetY } });
  };
  const sourceDuration = layoutDuration || total;
  const untouched = !doc.cuts.some((c) => c.accepted) && !doc.captions.enabled && doc.zoom.mode === 'off' && aspect === 'original';
  const currentLevels = {
    silence: doc.levels?.silence ?? batch?.preset.analysis.silence ?? 'medium',
    fillers: doc.levels?.fillers ?? batch?.preset.analysis.fillers ?? 'standard',
    retakes: doc.levels?.retakes ?? batch?.preset.analysis.retakes ?? true,
  };
  const removedSec = plan?.removedSec ?? 0;
  // Facts about this edit, e.g. "Removed 14 s · 6 filler words · 3 pauses".
  const summary = !anyAccepted && analysis.noSpeech
    ? doc.captions.enabled
      ? 'No speech found in this clip, so nothing was cut.'
      : 'No speech found in this clip, so nothing was cut and captions are off.'
    : anyAccepted
      ? [
          `Removed ${seconds(removedSec)}`,
          acceptedFillers > 0 ? plural(acceptedFillers, 'filler word', 'filler words') : '',
          acceptedPauses > 0 ? plural(acceptedPauses, 'pause', 'pauses') : '',
          acceptedRetakes > 0 ? plural(acceptedRetakes, 'retake', 'retakes') : '',
          acceptedManual > 0 ? plural(acceptedManual, 'cut by hand', 'cuts by hand') : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Nothing removed. The video plays at its full length.';
  const shownNotice = clipJob ?? (notice && notice.key === docJSON ? notice.text : null);

  const onTool = (id: ToolId) => {
    if (id === 'captions') {
      setPlaying(false);
      router.push({ pathname: '/editor/captions', params: { projectId } });
      return;
    }
    if (id === 'text') {
      openTextEditor();
      return;
    }
    setEditingWord(null);
    setTool(tool === id ? null : id);
  };

  return (
    <View style={styles.flex}>
      <Background />
      <View style={[styles.flex, { paddingTop: insets.top + 4 }]}>
        {/* iOS 26 editor bar: glass back and undo/redo on the left, More and the one primary action (Export) on the right. */}
        <View ref={tourTarget('editor.header')} style={[styles.gutter, styles.topBar]}>
          <View style={styles.topSide}>
            <IconButton icon="chevron.left" label="Back" onPress={() => router.back()} />
            <GlassCapsule style={styles.undoGroup}>
              <IconButton icon="arrow.uturn.backward" label="Undo" tone="ghost" size={40} onPress={undo} disabled={!canUndo} />
              <IconButton icon="arrow.uturn.forward" label="Redo" tone="ghost" size={40} onPress={redo} disabled={!canRedo} />
            </GlassCapsule>
          </View>
          <View style={styles.topSide}>
            <IconButton icon="ellipsis" label="More: revert, re-apply edit, reset caption edits, copy text to the batch, video info" onPress={openMenu} />
            <GradientButton
              title="Export"
              height={44}
              shape="pill"
              onPress={() => {
                setPlaying(false);
                router.push({ pathname: '/export/[projectId]', params: { projectId } });
              }}
            />
          </View>
        </View>

        {/* Preview and transport stay put (like CapCut); only the tools below scroll. */}
        <View style={[styles.gutter, styles.previewSlot, { height: maxH }]}>
          <FrameCanvas
            width={frameW}
            height={frameH}
            videoW={vW}
            videoH={vH}
            placement={placement}
            renderTick={renderTick}
            onCommit={commitPlacement}
            onAdjustStart={() => setPlaying(false)}
            onTap={() => setPlaying((p) => !p)}
            onDoubleTap={() => setFrame(frameMode === 'fit' ? 'fill' : 'fit')}>
            <TenfoldPreviewView
              ref={preview}
              projectId={projectId}
              document={previewJSON}
              playing={playing}
              // Mute is part of the document: the engine leaves the original sound out, added sounds still play.
              style={StyleSheet.absoluteFill}
              // Only playback drives the clock; scrubs and taps set the time themselves.
              onTime={(e) => {
                if (playing) setTime(e.nativeEvent.time);
              }}
              onReady={(e) => {
                setPreviewReady(true);
                setPreviewError(null);
                setRenderTick((t) => t + 1);
                const { width, height } = e.nativeEvent;
                if (!(width > 0 && height > 0)) return;
                // An older installed build ignores the aspect setting and keeps rendering the clip's own shape.
                if (aspect !== 'original' && Math.abs(width / height - aspectRatioValue(aspect)) > 0.02) {
                  setPreviewError('This installed build of Tenfold can’t change the frame. Install the latest build.');
                  return;
                }
                setRendered({ aspect, value: width / height, size: `${Math.round(width)}×${Math.round(height)}` });
              }}
              onEnd={() => setPlaying(false)}
              onPlayingChange={(e) => setPlaying(e.nativeEvent.playing)}
              onError={(e) => setPreviewError(e.nativeEvent.message)}
            />
          </FrameCanvas>
          {/* Text sits on the canvas, not on the video: it doesn't move when the video is pinched. */}
          <View style={[styles.overlay, { width: frameW, height: frameH }]} pointerEvents="box-none">
            <TextCanvas
              overlays={texts}
              width={frameW}
              height={frameH}
              time={time}
              total={total}
              selectedId={selectedTextId}
              onGrab={onGrabText}
              onOpen={onOpenText}
              onCommit={onCommitText}
              onDelete={deleteText}
            />
          </View>
          <View style={[styles.overlay, { width: frameW, height: frameH }]} pointerEvents="none">
            {previewError && (
              <GlassSurface style={styles.previewErrorBox}>
                <AppText variant="caption">Preview couldn’t update: {previewError}</AppText>
              </GlassSurface>
            )}
            {!previewReady && (
              <View style={styles.previewLoading}>
                <ActivityIndicator color={dark.textPrimary} />
              </View>
            )}
            <GlassCapsule variant="clear" style={styles.badge}>
              <AppText variant="caption" tabular>
                {untouched ? 'Original' : `${formatDuration(sourceDuration)} → ${formatDuration(total)}`}
              </AppText>
            </GlassCapsule>
          </View>
          {/* Play and the clock float over the footage as one glass capsule, like the Photos player. */}
          <View style={[styles.overlay, styles.transportLayer, { width: frameW, height: frameH }]} pointerEvents="box-none">
            <GlassCapsule style={styles.transport}>
              <PressableScale
                onPress={() => setPlaying((p) => !p)}
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel={playing ? 'Pause' : 'Play'}
                scaleTo={0.9}
                hitSlop={6}
                style={styles.play}>
                <SymbolView name={playing ? 'pause.fill' : 'play.fill'} size={17} tintColor={dark.textPrimary} />
              </PressableScale>
              <AppText variant="label" tabular style={styles.clock} accessibilityLabel={`${formatDuration(time)} of ${formatDuration(total)}`}>
                {formatDuration(time)}
                <AppText variant="label" tabular color={dark.textSecondary}>
                  {` / ${formatDuration(total)}`}
                </AppText>
              </AppText>
            </GlassCapsule>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets>
          <View ref={tourTarget('editor.tools')} style={[styles.gutter, styles.toolRow]}>
            {/* A selected clip, caption, text or sound swaps the project tools for what can be done to it. */}
            {selectedClip ? (
              <ActionBar
                label="Clip actions"
                actions={[
                  { id: 'split', icon: 'scissors', label: 'Split', onPress: splitClipAtPlayhead },
                  { id: 'delete', icon: 'trash', label: 'Delete', onPress: deleteSelectedClip, danger: true, disabled: layout.length <= 1 },
                  { id: 'done', icon: 'checkmark', label: 'Done', onPress: () => onSelect(null) },
                ]}
              />
            ) : selectedAudio ? (
              <ActionBar
                label="Sound actions"
                actions={
                  selectedAudio.source === 'original'
                    ? [
                        { id: 'split', icon: 'scissors', label: 'Split', onPress: splitAudioAtPlayhead },
                        { id: 'delete', icon: 'trash', label: 'Delete', onPress: () => deleteAudio(selectedAudio.id), danger: true },
                        { id: 'volume', icon: 'speaker.wave.2', label: 'Volume', onPress: () => setAudioControl(audioControl === 'volume' ? null : 'volume'), on: audioControl === 'volume' },
                        { id: 'fade', icon: 'waveform.path', label: 'Fade', onPress: () => setAudioControl(audioControl === 'fade' ? null : 'fade'), on: audioControl === 'fade' },
                        { id: 'mute', icon: muted ? 'speaker.slash.fill' : 'speaker.slash', label: 'Mute all', onPress: () => commit(setOriginalMuted(doc, !muted)), on: muted },
                        { id: 'done', icon: 'checkmark', label: 'Done', onPress: () => onSelect(null) },
                      ]
                    : [
                        { id: 'split', icon: 'scissors', label: 'Split', onPress: splitAudioAtPlayhead },
                        { id: 'delete', icon: 'trash', label: 'Delete', onPress: () => deleteAudio(selectedAudio.id), danger: true },
                        { id: 'volume', icon: 'speaker.wave.2', label: 'Volume', onPress: () => setAudioControl(audioControl === 'volume' ? null : 'volume'), on: audioControl === 'volume' },
                        { id: 'fade', icon: 'waveform.path', label: 'Fade', onPress: () => setAudioControl(audioControl === 'fade' ? null : 'fade'), on: audioControl === 'fade' },
                        { id: 'loop', icon: 'repeat', label: 'Loop', onPress: () => editAudio((d, t) => setClipLoop(d, selectedAudio.id, !selectedAudio.loop, t)), on: !!selectedAudio.loop },
                        { id: 'duck', icon: 'person.wave.2', label: 'Ducking', onPress: () => editAudio((d, t) => setClipDucking(d, selectedAudio.id, !selectedAudio.ducking, t)), on: !!selectedAudio.ducking },
                        { id: 'done', icon: 'checkmark', label: 'Done', onPress: () => onSelect(null) },
                      ]
                }
              />
            ) : selectedText ? (
              <ActionBar
                label="Text actions"
                actions={[
                  { id: 'edit', icon: 'character.cursor.ibeam', label: 'Edit', onPress: () => openTextEditor(selectedText.id) },
                  { id: 'style', icon: 'textformat', label: 'Style', onPress: () => openTextEditor(selectedText.id, 'style') },
                  {
                    id: 'duration',
                    icon: 'arrow.left.and.right',
                    label: 'Whole clip',
                    onPress: () => textWholeClip(selectedText.id),
                    disabled: isWholeClip(selectedText),
                  },
                  { id: 'delete', icon: 'trash', label: 'Delete', onPress: () => deleteText(selectedText.id), danger: true },
                  { id: 'done', icon: 'checkmark', label: 'Done', onPress: () => onSelect(null) },
                ]}
              />
            ) : selectedCard ? (
              <ActionBar
                label="Caption actions"
                actions={[
                  { id: 'text', icon: 'character.cursor.ibeam', label: 'Edit text', onPress: () => setEditingCaption(selectedCard.id) },
                  { id: 'split', icon: 'scissors', label: 'Split', onPress: splitCaptionAtPlayhead, disabled: selectedCard.words.length < 2 },
                  { id: 'merge', icon: 'arrow.right.to.line', label: 'Merge', onPress: mergeCaptionWithNext, disabled: !nextCard(selectedCard) },
                  hiddenIds.has(selectedCard.id)
                    ? { id: 'show', icon: 'eye', label: 'Show', onPress: toggleCaptionHidden }
                    : { id: 'hide', icon: 'eye.slash', label: 'Hide', onPress: toggleCaptionHidden },
                  { id: 'done', icon: 'checkmark', label: 'Done', onPress: () => onSelect(null) },
                ]}
              />
            ) : (
              <ToolBar tools={TOOLS} active={tool} onPress={onTool} />
            )}
          </View>

          {plan && (
            <Timeline
              segments={segments}
              compDuration={plan.compDuration}
              cards={plan.cards}
              hiddenCards={plan.hiddenCards ?? NO_CARDS}
              texts={texts}
              envelopeDb={analysis.envelopeDb}
              thumbs={placedThumbs}
              splits={editPoints}
              selection={timelineSelection}
              restorable={restorable}
              time={time}
              muted={muted}
              audioClips={audioClips}
              audioWaves={waves}
              onScrubStart={onScrubStart}
              onScrub={onScrub}
              onScrubEnd={onScrubEnd}
              onSelect={onSelect}
              onTrimRegion={onTrimRegion}
              onRetimeCaption={onRetimeCaption}
              onRetimeText={onRetimeText}
              onRetimeAudio={onRetimeAudio}
              onMoveAudio={onMoveAudio}
              clips={timelineClips}
              clipRestorable={{ start: clipRestorable.head, end: clipRestorable.tail }}
              onTapClip={onTapClip}
              onReorderClip={onReorderClip}
              onTrimClip={onTrimClip}
              onAddClip={canAddClips ? openAddClip : undefined}
            />
          )}

          {plan && (
            <View ref={tourTarget('editor.editbar')} style={[styles.gutter, styles.editBar]}>
              {nothingSelected && (
                <>
                  <EditAction icon="scissors" label="Split" onPress={splitAtPlayhead} />
                  <EditAction icon="trash" label="Delete" onPress={deleteSelected} disabled={!selected} danger />
                </>
              )}
              {/* Only messages the user caused show here; the strip explains itself by use. */}
              <AppText
                variant="caption"
                color={shownNotice ? dark.textPrimary : dark.textMuted}
                style={styles.editHint}
                numberOfLines={2}
                accessibilityLiveRegion="polite">
                {shownNotice ??
                  (selected
                    ? timelineClips
                      ? 'Drag the ends to trim'
                      : 'Drag the ends to trim'
                    : selectedClip
                      ? 'Drag ends to trim · hold to move · tap again for a part'
                      : selectedCard
                      ? 'Drag the ends to retime'
                      : selectedText
                        ? 'Drag the ends to retime'
                        : selectedAudio
                          ? selectedAudio.source === 'file'
                            ? 'Drag ends to trim · middle to move'
                            : 'Drag the ends to trim'
                          : '')}
              </AppText>
            </View>
          )}

          <View style={[styles.gutter, styles.panel]}>
            {selectedText && (
              <Panel title="Text" detail={textTiming(selectedText, total)}>
                <PressableScale
                  haptic={false}
                  scaleTo={0.98}
                  onPress={() => openTextEditor(selectedText.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Text: ${selectedText.text}`}
                  accessibilityHint="Edits the text."
                  style={styles.captionTextBox}>
                  <AppText variant="body">{selectedText.text}</AppText>
                </PressableScale>
              </Panel>
            )}

            {selectedCard && (
              <Panel
                title={hiddenIds.has(selectedCard.id) ? 'Caption (hidden)' : 'Caption'}
                detail={`${selectedCard.start.toFixed(1)}–${selectedCard.end.toFixed(1)} s · ${selectedCard.words.length === 1 ? '1 word' : `${selectedCard.words.length} words`}`}>
                {editingCaption === selectedCard.id ? (
                  <TextInput
                    autoFocus
                    defaultValue={captionText(selectedCard, doc, words)}
                    autoCorrect={false}
                    returnKeyType="done"
                    submitBehavior="blurAndSubmit"
                    keyboardAppearance="dark"
                    selectionColor={dark.accent}
                    accessibilityLabel="Caption text"
                    accessibilityHint="Done saves it. Leave it empty to use the transcribed words."
                    onEndEditing={(e) => saveCaptionText(selectedCard, e.nativeEvent.text)}
                    style={styles.captionInput}
                  />
                ) : (
                  <PressableScale
                    haptic={false}
                    scaleTo={0.98}
                    onPress={() => setEditingCaption(selectedCard.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Caption text: ${selectedCard.words.map((w) => w.text).join(' ')}`}
                    accessibilityHint="Edits the text."
                    style={styles.captionTextBox}>
                    <AppText variant="body">{selectedCard.words.map((w) => w.text).join(' ')}</AppText>
                  </PressableScale>
                )}
              </Panel>
            )}

            {nothingSelected && tool === null && (
              <Panel title="This edit" animate={false}>
                <AppText variant="bodyStrong" tabular>
                  {summary}
                </AppText>
                {!analysis.noSpeech && candidates.length > 0 && (
                  <>
                    <AppText variant="label" color={dark.textSecondary}>
                      {[
                        fillerCandidates.length > 0
                          ? fillerCandidates.length === 1
                            ? '1 more spot sounds like a filler word'
                            : `${fillerCandidates.length} more spots sound like filler words`
                          : '',
                        retakeCandidates.length > 0
                          ? retakeCandidates.length === 1
                            ? '1 sentence may be a retake'
                            : `${retakeCandidates.length} sentences may be retakes`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      .
                    </AppText>
                    <View style={styles.buttonRow}>
                      <OutlineButton
                        title={candidates.length === 1 ? 'Cut it' : `Cut ${candidates.length}`}
                        height={44}
                        style={styles.flex}
                        onPress={() => commit({ ...doc, cuts: doc.cuts.map((c) => (candidates.some((x) => x.id === c.id) ? { ...c, accepted: true } : c)) })}
                      />
                      <OutlineButton title="Review words" height={44} style={styles.flex} onPress={() => setTool('words')} />
                    </View>
                  </>
                )}
              </Panel>
            )}

            {nothingSelected && tool === 'words' && (
              <Panel title="Words" detail="Tap to cut · hold to fix spelling">
                {words.length === 0 ? (
                  <AppText variant="label" color={dark.textSecondary}>
                    No words were transcribed for this clip.
                  </AppText>
                ) : (
                  <View style={styles.words}>
                    {words.map((w, i) => {
                      const cut = cutForWord(i);
                      const removed = !!cut?.accepted;
                      const candidate = !!cut && !cut.accepted && cut.reason !== 'manual';
                      // An empty override (caption text retyped with fewer words) keeps the word in the video: show it.
                      const text = overrides.get(i) || w.text;
                      if (editingWord === i) {
                        return (
                          <TextInput
                            key={i}
                            autoFocus
                            defaultValue={text}
                            selectTextOnFocus
                            autoCorrect={false}
                            autoCapitalize="none"
                            returnKeyType="done"
                            keyboardAppearance="dark"
                            selectionColor={dark.accent}
                            accessibilityLabel={`Spelling of “${w.text}”`}
                            accessibilityHint="Done saves it. Leave it empty to use the transcribed word."
                            onEndEditing={(e) => saveWord(i, e.nativeEvent.text)}
                            style={[styles.word, styles.wordInput]}
                          />
                        );
                      }
                      return (
                        <PressableScale
                          key={i}
                          haptic={false}
                          scaleTo={0.94}
                          hitSlop={{ top: 5, bottom: 5 }}
                          onPress={() => toggleWord(i)}
                          onLongPress={() => startEditingWord(i)}
                          accessibilityRole="button"
                          accessibilityLabel={`${text}${removed ? ', removed' : candidate ? (cut?.reason === 'retake' ? ', possible retake' : ', possible filler') : ''}`}
                          accessibilityHint={removed ? 'Restores the word.' : 'Cuts the word.'}
                          accessibilityActions={[{ name: 'fixSpelling', label: 'Fix spelling' }]}
                          onAccessibilityAction={(e) => e.nativeEvent.actionName === 'fixSpelling' && startEditingWord(i)}
                          style={[
                            styles.word,
                            i === activeWord && !removed && styles.wordActive,
                            removed && styles.wordRemoved,
                            candidate && styles.wordCandidate,
                          ]}>
                          <AppText
                            variant="chip"
                            color={removed ? dark.danger : i === activeWord ? dark.textInverse : dark.chipText}
                            style={removed && styles.strike}>
                            {text}
                          </AppText>
                        </PressableScale>
                      );
                    })}
                  </View>
                )}
              </Panel>
            )}

            {nothingSelected && tool === 'cuts' && (
              <Panel title="Cuts">
                <View style={styles.statRow}>
                  <Stat value={String(acceptedPauses)} label="Pauses" />
                  <Stat value={String(acceptedFillers)} label="Fillers" />
                  <Stat value={String(acceptedRetakes)} label="Retakes" />
                  <Stat value={String(acceptedManual)} label="By hand" />
                  <Stat value={removedSec.toFixed(1)} label="Seconds" />
                </View>
                <View style={styles.group}>
                  <OptionLabel>Pause cutting</OptionLabel>
                  <ChipGroup>
                    {SILENCE.map((o) => (
                      <Chip key={o.v} label={o.l} selected={currentLevels.silence === o.v} onPress={() => applyLevels({ ...currentLevels, silence: o.v })} />
                    ))}
                  </ChipGroup>
                </View>
                <View style={styles.group}>
                  <OptionLabel>Filler words</OptionLabel>
                  <ChipGroup>
                    {FILLERS.map((o) => (
                      <Chip key={o.v} label={o.l} selected={currentLevels.fillers === o.v} onPress={() => applyLevels({ ...currentLevels, fillers: o.v })} />
                    ))}
                  </ChipGroup>
                </View>
                <View style={styles.group}>
                  <OptionLabel>Retakes</OptionLabel>
                  <ChipGroup>
                    <Chip label="Off" selected={!currentLevels.retakes} onPress={() => applyLevels({ ...currentLevels, retakes: false })} />
                    <Chip label="On" selected={currentLevels.retakes} onPress={() => applyLevels({ ...currentLevels, retakes: true })} />
                  </ChipGroup>
                  <AppText variant="caption" color={dark.textMuted}>
                    Keeps the last take of a repeated line
                  </AppText>
                </View>
                {levelsError && (
                  <AppText variant="label" color={dark.danger}>
                    {levelsError}
                  </AppText>
                )}
                {anyAccepted && (
                  <OutlineButton
                    title="Restore all cuts"
                    icon="arrow.counterclockwise"
                    height={44}
                    onPress={() => commit({ ...doc, cuts: doc.cuts.map((c) => ({ ...c, accepted: false })) })}
                  />
                )}
              </Panel>
            )}

            {nothingSelected && tool === 'zoom' && (
              <Panel title="Zoom" detail="Punches in at each cut">
                <ChipGroup>
                  {ZOOMS.map((z) => (
                    <Chip key={z.v} label={z.l} selected={doc.zoom.mode === z.v} onPress={() => commit({ ...doc, zoom: { ...doc.zoom, mode: z.v } })} />
                  ))}
                </ChipGroup>
                {doc.zoom.mode !== 'off' && (
                  <View style={styles.group}>
                    <OptionLabel>Strength</OptionLabel>
                    <ChipGroup>
                      {([1, 2, 3] as const).map((n) => (
                        <Chip
                          key={n}
                          label={n === 1 ? 'Gentle' : n === 2 ? 'Normal' : 'Strong'}
                          selected={doc.zoom.intensity === n}
                          onPress={() => commit({ ...doc, zoom: { ...doc.zoom, intensity: n } })}
                        />
                      ))}
                    </ChipGroup>
                  </View>
                )}
              </Panel>
            )}

            {nothingSelected && tool === 'crop' && (
              <Panel
                title="Frame"
                detail={
                  frameMode === 'custom'
                    ? `By hand · ${Math.round(placement.scale * 100)}%`
                    : 'Pinch to zoom · drag to move'
                }>
                <View style={styles.group}>
                  <OptionLabel>Canvas</OptionLabel>
                  <View style={styles.aspects}>
                    {ASPECTS.map((a) => {
                      const on = aspect === a.id;
                      const r = aspectRatioValue(a.id, project.media ?? undefined);
                      const box = r >= 1 ? { width: 24, height: 24 / r } : { width: 24 * r, height: 24 };
                      return (
                        <PressableScale
                          key={a.id}
                          haptic={false}
                          scaleTo={0.96}
                          onPress={() => {
                            if (on) return;
                            // A new canvas starts with the whole video visible (Fit); pinch in to fill.
                            commit({ ...doc, crop: { auto916: a.id === '9:16', aspect: a.id, scale: 1, offsetX: 0, offsetY: 0 } });
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${a.label}, ${a.hint}`}
                          style={[styles.aspect, on && styles.aspectOn]}>
                          <View style={styles.aspectIcon}>
                            <View style={[styles.aspectBox, box, on && styles.aspectBoxOn]} />
                          </View>
                          <AppText variant="caption" color={on ? dark.textPrimary : dark.textSecondary} numberOfLines={1}>
                            {a.label}
                          </AppText>
                        </PressableScale>
                      );
                    })}
                  </View>
                </View>
                <View style={styles.group}>
                  <OptionLabel>Video</OptionLabel>
                  <View style={styles.segment}>
                    {(
                      [
                        { id: 'fit', label: 'Fit', hint: 'Whole video' },
                        { id: 'fill', label: 'Fill', hint: 'No bars' },
                        { id: 'auto', label: 'Auto', hint: 'Follows speaker' },
                      ] as const
                    ).map((m) => {
                      const on = frameMode === m.id;
                      return (
                        <PressableScale
                          key={m.id}
                          haptic={false}
                          scaleTo={0.96}
                          onPress={() => !on && setFrame(m.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${m.label}: ${m.hint}`}
                          style={[styles.segmentItem, on && styles.segmentOn]}>
                          <AppText variant="chip" color={on ? dark.textInverse : dark.textPrimary}>
                            {m.label}
                          </AppText>
                          <AppText variant="caption" color={on ? 'rgba(0,0,0,0.6)' : dark.textMuted}>
                            {m.hint}
                          </AppText>
                        </PressableScale>
                      );
                    })}
                  </View>
                </View>
                {layout.length > 1 && (
                  <AppText variant="caption" color={dark.textMuted}>
                    Applies to all {layout.length} clips.
                  </AppText>
                )}
              </Panel>
            )}

            {selectedAudio && (
              <Panel title={selectedAudio.source === 'original' ? 'Original sound' : (selectedAudio.title ?? 'Sound')} detail={soundDetail(selectedAudio, muted)}>
                {audioControl === 'volume' && (
                  <LevelSlider
                    key={`${selectedAudio.id}-${selectedAudio.volume}`}
                    label="Volume"
                    value={selectedAudio.volume}
                    onCommit={(v) => editAudio((d, t) => setClipVolume(d, selectedAudio.id, v, t))}
                  />
                )}
                {audioControl === 'fade' && (
                  <View style={styles.group}>
                    <Stepper
                      label="Fade in"
                      value={selectedAudio.fadeIn}
                      min={0}
                      max={Math.min(MAX_FADE, selectedAudio.end - selectedAudio.start - selectedAudio.fadeOut)}
                      step={FADE_STEP}
                      format={fadeLabel}
                      onChange={(v) => editAudio((d, t) => setClipFades(d, selectedAudio.id, { fadeIn: v }, t))}
                    />
                    <Stepper
                      label="Fade out"
                      value={selectedAudio.fadeOut}
                      min={0}
                      max={Math.min(MAX_FADE, selectedAudio.end - selectedAudio.start - selectedAudio.fadeIn)}
                      step={FADE_STEP}
                      format={fadeLabel}
                      onChange={(v) => editAudio((d, t) => setClipFades(d, selectedAudio.id, { fadeOut: v }, t))}
                    />
                  </View>
                )}
                {canLoopToFit(selectedAudio, total) && (
                  <OutlineButton
                    title="Loop to fit"
                    icon="repeat"
                    height={44}
                    onPress={() => editAudio((d, t) => setClipLoop(d, selectedAudio.id, true, t))}
                  />
                )}
              </Panel>
            )}

            {nothingSelected && tool === 'audio' && (
              <Panel
                title="Audio"
                detail={audioEditable ? 'Music dips under speech' : 'Recorded sound'}>
                {audioEditable && (
                  <View style={styles.group}>
                    <OptionLabel>Add sound</OptionLabel>
                    <ActionRows
                      rows={[
                        { id: 'files', icon: 'folder', title: 'From Files', onPress: () => addSound('files'), busy: adding === 'files', disabled: !!adding },
                        { id: 'photos', icon: 'photo.on.rectangle', title: 'From a video in Photos', onPress: () => addSound('photos'), busy: adding === 'photos', disabled: !!adding },
                        { id: 'voice', icon: 'mic', title: 'Record voiceover', onPress: openVoiceover, disabled: !!adding },
                      ]}
                    />
                  </View>
                )}
                <ToggleRow
                  title="Mute original audio"
                  subtitle={audioEditable ? 'Added sounds keep playing.' : undefined}
                  value={muted}
                  onChange={(v) => commit(setOriginalMuted(doc, v))}
                />
                {!audioEditable && (
                  <AppText variant="caption" color={dark.textMuted}>
                    Adding music and voiceovers needs the latest build of Tenfold.
                  </AppText>
                )}
              </Panel>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/** "1.2–4.0 s · 80% · fades 0.5 s / 1 s" for a selected sound. */
function soundDetail(c: AudioClip, muted: boolean) {
  const parts = [`${c.start.toFixed(1)}–${c.end.toFixed(1)} s`, `${Math.round(c.volume * 100)}%`];
  if (c.fadeIn || c.fadeOut) parts.push(`fades ${fadeLabel(c.fadeIn)} / ${fadeLabel(c.fadeOut)}`);
  if (c.source === 'file') {
    if (c.loop) parts.push('loops');
    if (c.ducking) parts.push('dips under speech');
  } else if (muted) {
    parts.push('muted');
  }
  return parts.join(' · ');
}

/** "Whole clip" or "1.2–4.0 s" (output time). */
function textTiming(o: TextOverlay, total: number) {
  if (isWholeClip(o)) return 'Whole clip · drag its ends in the timeline to time it';
  const w = overlayWindow(o, total);
  return `${w.start.toFixed(1)}–${w.end.toFixed(1)} s`;
}

function EditAction({ icon, label, onPress, disabled, danger }: { icon: 'scissors' | 'trash'; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const tint = disabled ? dark.textMuted : danger ? dark.danger : dark.textPrimary;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={false}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      style={[styles.editAction, disabled && styles.editActionOff]}>
      <SymbolView name={icon} size={15} weight="regular" tintColor={tint} />
      <AppText variant="chip" color={tint}>
        {label}
      </AppText>
    </PressableScale>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="title" tabular>
        {value}
      </AppText>
      <AppText variant="caption" color={dark.textSecondary} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: spacing.gutter },
  centerText: { textAlign: 'center' },
  gutter: { paddingHorizontal: spacing.gutter },
  previewSlot: { alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', alignSelf: 'center' },
  bone: { borderRadius: radii.card, borderCurve: 'continuous', backgroundColor: dark.card },
  skeletonTools: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  skeletonTool: { flex: 1, height: 58, borderRadius: radii.tile },
  group: { gap: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.md },
  segment: { flexDirection: 'row', gap: 8 },
  segmentItem: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    backgroundColor: dark.chipFill,
  },
  segmentOn: { backgroundColor: dark.chipSelectedFill },
  previewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, marginBottom: spacing.sm },
  topSide: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  undoGroup: { paddingHorizontal: 2, gap: 0, minHeight: 44 },
  badge: { position: 'absolute', top: spacing.md, left: spacing.md, minHeight: 28, paddingHorizontal: 10 },
  previewErrorBox: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: 48,
    padding: 10,
    borderRadius: radii.tile,
  },
  transportLayer: { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: spacing.md },
  transport: { minHeight: 40, paddingLeft: 4, paddingRight: 14, gap: 2 },
  play: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  clock: { minWidth: 72 },
  toolRow: { marginTop: spacing.lg, marginBottom: spacing.lg },
  editBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  editAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: dark.card,
  },
  editActionOff: { opacity: 0.5 },
  editHint: { flex: 1, marginLeft: spacing.xs },
  aspects: { flexDirection: 'row', gap: 6 },
  aspect: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    backgroundColor: dark.chipFill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  aspectOn: { borderColor: dark.textPrimary, backgroundColor: dark.cardHigh },
  aspectIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  aspectBox: { borderRadius: 3, borderWidth: 1.5, borderColor: dark.textSecondary },
  aspectBoxOn: { borderColor: dark.textPrimary },
  panel: { marginTop: spacing.xl },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  word: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    justifyContent: 'center',
    backgroundColor: dark.chipFill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  wordInput: {
    ...typeScale.chip,
    lineHeight: undefined,
    minWidth: 64,
    paddingVertical: 0,
    color: dark.textPrimary,
    backgroundColor: dark.cardHigh,
    borderColor: dark.accent,
  },
  wordActive: { backgroundColor: dark.chipSelectedFill },
  wordRemoved: { backgroundColor: dark.dangerSoft },
  wordCandidate: { borderColor: dark.danger, borderStyle: 'dashed' },
  strike: { textDecorationLine: 'line-through' },
  captionTextBox: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.tile, backgroundColor: dark.chipFill },
  captionInput: {
    ...typeScale.body,
    lineHeight: undefined,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.tile,
    color: dark.textPrimary,
    backgroundColor: dark.cardHigh,
    borderWidth: 1,
    borderColor: dark.accent,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1, gap: 2 },
});
