import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorText } from '@/batch/queue';
import {
  AppText,
  Background,
  Chip,
  ChipGroup,
  GradientButton,
  IconButton,
  OptionLabel,
  OutlineButton,
  PressableScale,
  ScreenHeader,
  ToggleRow,
} from '@/design/components';
import { colors, radii, spacing, type as typeScale } from '@/design/tokens';
import { editsOf } from '@/batch/edits';
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
  syncAudioToCuts,
  trimAudioClip,
} from '@/editor/audioClips';
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
  TenfoldPreviewView,
  type AddedAudio,
  type Analysis,
  type AudioClip,
  type CaptionCard,
  type Cut,
  type EditDocument,
  type EditPlan,
  type FillerLevel,
  type SilenceLevel,
  type TenfoldPreviewViewRef,
  type TextOverlay,
  type Thumbnail,
  type ZoomMode,
} from '@/engine';
import { commitDoc, redoDoc, undoDoc, useEditHistory } from '@/state/history';
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
    | null
  >(null);
  // Inline control open under a selected sound (Volume or Fade in its action bar).
  const [audioControl, setAudioControl] = useState<'volume' | 'fade' | null>(null);
  // Which "Add sound" row is waiting on a picker.
  const [adding, setAdding] = useState<'files' | 'photos' | null>(null);
  // This build's engine plays audio clips (older builds would ignore them in preview and export).
  const [audioEditable] = useState(() => Engine.canEditAudio());
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

  // Load the analysis (transcript, envelope) and filmstrip frames from the native project folder.
  useEffect(() => {
    let alive = true;
    Engine.getAnalysis(projectId)
      .then((a) => alive && setAnalysis(a))
      .catch((e) => alive && setLoadError(errorText(e)));
    // About one filmstrip frame per 2 s (16–60), so long clips don't repeat the same few frames.
    Engine.thumbnails(projectId, Math.round(Math.min(60, Math.max(16, (useLibrary.getState().projects[projectId]?.media?.durationSec ?? 0) / 2))))
      .then((t) => alive && setThumbs(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

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
  // A change of cuts changes the output length: the sound follows in the same undo step.
  const commit = useCallback(
    (next: EditDocument) => {
      setPlaying(false);
      const { docs, projects } = useLibrary.getState();
      commitDoc(projectId, syncAudioToCuts(docs[projectId], next, projects[projectId]?.media?.durationSec ?? 0));
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
  const nothingSelected = !selectedCard && !selectedText && !selectedAudio;

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

  // Removed footage next to the selected clip's ends: how far each end can be dragged outward.
  const restorable = useMemo(() => {
    const dur = project?.media?.durationSec ?? plan?.compDuration ?? 0;
    if (!selected) return { start: 0, end: 0 };
    return { start: restorableSec(segments, selected, 'start', dur), end: restorableSec(segments, selected, 'end', dur) };
  }, [selected, segments, project?.media?.durationSec, plan?.compDuration]);

  const onTrimRegion = useCallback(
    (region: Region, side: 'start' | 'end', delta: number) => {
      const latest = useLibrary.getState().docs[projectId];
      if (!latest) return false;
      const dur = useLibrary.getState().projects[projectId]?.media?.durationSec ?? plan?.compDuration ?? 0;
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
    for (const t of thumbs) {
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
    if (!seg || compSplits.some((c) => Math.abs(c - time) < 0.15)) {
      setNotice({ text: 'Can’t split here. Move the playhead inside a clip, away from its edges.', key: docJSON });
      return;
    }
    setPlaying(false);
    commit({ ...doc, splits: [...(doc.splits ?? []), seg.start + (time - seg.compStart)] });
  };

  const deleteSelected = () => {
    if (!doc || !selected || !plan) return;
    if (regionsOf(segments, compSplits, plan.compDuration).length <= 1) {
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
      const suggested = await Engine.suggestCuts(projectId, {
        silence: next.silence,
        fillers: next.fillers,
        retakes: next.retakes ?? true,
        language: analysis?.transcript?.language ?? 'auto',
      });
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
    const base: EditDocument = { ...docFromAnalysis(analysis, batch, editsOf(project, batch)), wordOverrides: doc.wordOverrides };
    // Added sounds are the user's too; the original sound comes back whole.
    const fresh = keepAddedSounds(base, doc, project.media?.durationSec ?? analysis.media.durationSec);
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
            <AppText variant="label" color={colors.textSecondary} style={styles.centerText}>
              {loadError ?? project.error ?? 'Run the batch first.'}
            </AppText>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.textPrimary} />
            <AppText variant="label" color={colors.textSecondary}>
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
  const sourceDuration = project.media?.durationSec ?? total;
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
  const shownNotice = notice && notice.key === docJSON ? notice.text : null;

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
        <View ref={tourTarget('editor.header')} style={styles.gutter}>
          <ScreenHeader
            title={project.title}
            right={
              <>
                <IconButton icon="ellipsis" label="More: revert, re-apply edit, reset caption edits, copy text to the batch, video info" size={44} iconScale={0.45} onPress={openMenu} />
                <GradientButton
                  title="Export"
                  height={44}
                  shape="pill"
                  onPress={() => {
                    setPlaying(false);
                    router.push({ pathname: '/export/[projectId]', params: { projectId } });
                  }}
                />
              </>
            }
          />
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
            {!playing && previewReady && (
              <View style={styles.bigPlay}>
                <SymbolView name="play.fill" size={26} tintColor={colors.textPrimary} />
              </View>
            )}
            {previewError && (
              <View style={styles.previewErrorBox}>
                <AppText variant="caption">Preview couldn’t update: {previewError}</AppText>
              </View>
            )}
            {!previewReady && (
              <View style={styles.previewLoading}>
                <ActivityIndicator color={colors.textPrimary} />
              </View>
            )}
            <View style={styles.badge}>
              <AppText variant="caption" tabular>
                {untouched ? 'Original' : `${formatDuration(sourceDuration)} → ${formatDuration(total)}`}
              </AppText>
            </View>
          </View>
        </View>

        <View style={[styles.gutter, styles.transport]}>
          <View style={styles.transportSide}>
            <IconButton icon="arrow.uturn.backward" label="Undo" tone="ghost" size={44} iconScale={0.45} onPress={undo} disabled={!canUndo} />
            <IconButton icon="arrow.uturn.forward" label="Redo" tone="ghost" size={44} iconScale={0.45} onPress={redo} disabled={!canRedo} />
          </View>
          <PressableScale
            onPress={() => setPlaying((p) => !p)}
            haptic={false}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            scaleTo={0.9}
            style={styles.play}>
            <SymbolView name={playing ? 'pause.fill' : 'play.fill'} size={26} tintColor={colors.textPrimary} />
          </PressableScale>
          <View style={[styles.transportSide, styles.transportRight]}>
            <AppText variant="label" tabular accessibilityLabel={`${formatDuration(time)} of ${formatDuration(total)}`}>
              {formatDuration(time)}
              <AppText variant="label" tabular color={colors.textMuted}>
                {` / ${formatDuration(total)}`}
              </AppText>
            </AppText>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets>
          <View ref={tourTarget('editor.tools')} style={[styles.gutter, styles.toolRow]}>
            {/* A selected caption, text or sound swaps the project tools for what can be done to it. */}
            {selectedAudio ? (
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
              thumbs={thumbs}
              splits={compSplits}
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
                color={shownNotice ? colors.textPrimary : colors.textMuted}
                style={styles.editHint}
                numberOfLines={2}
                accessibilityLiveRegion="polite">
                {shownNotice ??
                  (selected
                    ? 'Clip selected. Drag its ends to trim.'
                    : selectedCard
                      ? 'Caption selected. Drag its ends to change when it shows.'
                      : selectedText
                        ? 'Text selected. Drag its ends to change when it shows.'
                        : selectedAudio
                          ? selectedAudio.source === 'file'
                            ? 'Sound selected. Drag its ends to trim, the middle to move it.'
                            : 'Original sound selected. Drag its ends to trim.'
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
                    selectionColor={colors.accent}
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
                    <AppText variant="label" color={colors.textSecondary}>
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
              <Panel title="Words" detail="Tap a word to cut or restore it. Hold it to fix the spelling.">
                {words.length === 0 ? (
                  <AppText variant="label" color={colors.textSecondary}>
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
                            selectionColor={colors.violet}
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
                            color={removed ? colors.danger : i === activeWord ? colors.textInverse : colors.chipText}
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
              <Panel title="Cuts" detail="Pauses, filler words and retakes taken out of this video.">
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
                  <AppText variant="caption" color={colors.textMuted}>
                    When a sentence is said twice, the first attempt is removed. Only near-exact repeats are cut without asking.
                  </AppText>
                </View>
                {levelsError && (
                  <AppText variant="label" color={colors.danger}>
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
              <Panel title="Zoom" detail="Punches in at each cut to hide the jump. Dynamic also zooms on new sentences.">
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
                    ? `Placed by hand at ${Math.round(placement.scale * 100)}%. Double-tap the video for Fit or Fill.`
                    : 'Pinch the video to zoom, drag to move. Double-tap for Fit or Fill.'
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
                          <AppText variant="caption" color={on ? colors.textPrimary : colors.textSecondary} numberOfLines={1}>
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
                          <AppText variant="chip" color={on ? colors.textInverse : colors.textPrimary}>
                            {m.label}
                          </AppText>
                          <AppText variant="caption" color={on ? 'rgba(0,0,0,0.6)' : colors.textMuted}>
                            {m.hint}
                          </AppText>
                        </PressableScale>
                      );
                    })}
                  </View>
                </View>
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
                detail={audioEditable ? 'Adds at the playhead. Music dips while someone speaks.' : 'The sound recorded with the clip.'}>
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
                  <AppText variant="caption" color={colors.textMuted}>
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
  const tint = disabled ? colors.textMuted : danger ? colors.danger : colors.textPrimary;
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
      <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
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
  bone: { borderRadius: radii.card, borderCurve: 'continuous', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  skeletonTools: { flexDirection: 'row', gap: 4, marginTop: 72 },
  skeletonTool: { flex: 1, height: 56, borderRadius: 14 },
  group: { gap: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.md },
  segment: { flexDirection: 'row', gap: 8 },
  segmentItem: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.chipFill,
  },
  segmentOn: { backgroundColor: colors.chipSelectedFill },
  previewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    justifyContent: 'center',
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  previewErrorBox: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(120,20,30,0.85)',
  },
  bigPlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    paddingLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  transportSide: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  transportRight: { justifyContent: 'flex-end' },
  play: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  toolRow: { marginTop: spacing.sm, marginBottom: spacing.lg },
  editBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  editAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.chipFill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  aspectOn: { borderColor: colors.textPrimary, backgroundColor: colors.cardHigh },
  aspectIcon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  aspectBox: { borderRadius: 3, borderWidth: 1.5, borderColor: colors.textSecondary },
  aspectBoxOn: { borderColor: colors.textPrimary },
  panel: { marginTop: spacing.xl },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  word: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    justifyContent: 'center',
    backgroundColor: colors.chipFill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  wordInput: {
    ...typeScale.chip,
    lineHeight: undefined,
    minWidth: 64,
    paddingVertical: 0,
    color: colors.textPrimary,
    backgroundColor: colors.cardHigh,
    borderColor: colors.violet,
  },
  wordActive: { backgroundColor: colors.chipSelectedFill },
  wordRemoved: { backgroundColor: colors.dangerSoft },
  wordCandidate: { borderColor: colors.danger, borderStyle: 'dashed' },
  strike: { textDecorationLine: 'line-through' },
  captionTextBox: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.tile, backgroundColor: colors.chipFill },
  captionInput: {
    ...typeScale.body,
    lineHeight: undefined,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.tile,
    color: colors.textPrimary,
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1, gap: 2 },
});
