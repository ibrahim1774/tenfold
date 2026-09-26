import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorText } from '@/batch/queue';
import {
  AppText,
  Background,
  Card,
  Chip,
  ChipGroup,
  IconButton,
  OptionLabel,
  OutlineButton,
  PressableScale,
  ScreenHeader,
  SuggestionCard,
  ToggleRow,
  ToolButton,
} from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { ASPECTS, aspectOf, aspectRatioValue } from '@/editor/aspect';
import { regionsOf, Timeline, toSource, type Region } from '@/editor/Timeline';
import {
  Engine,
  TenfoldPreviewView,
  type Analysis,
  type Cut,
  type EditDocument,
  type EditPlan,
  type FillerLevel,
  type SilenceLevel,
  type TenfoldPreviewViewRef,
  type Thumbnail,
  type ZoomMode,
} from '@/engine';
import { commitDoc, redoDoc, undoDoc, useEditHistory } from '@/state/history';
import { formatDuration, useLibrary } from '@/state/library';

type Tool = 'cuts' | 'words' | 'zoom' | 'crop' | 'audio' | null;

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
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  // Selection is tied to the document it was made on, so any edit (or undo) clears it.
  const [selection, setSelection] = useState<{ region: Region; key: string } | null>(null);
  // Shape reported by the native preview, remembered with the aspect setting that produced it.
  const [rendered, setRendered] = useState<{ aspect: string; value: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
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
        .then((p) => alive && setPlan(p))
        .catch(() => {});
    }, 60);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [doc, analysis, projectId]);

  const docJSON = useMemo(() => (doc ? JSON.stringify(doc) : ''), [doc]);
  // What the native preview renders: UI-only fields left out, so a split doesn't rebuild the player.
  const previewJSON = useMemo(() => {
    if (!doc) return '';
    const { splits: _splits, levels: _levels, ...rest } = doc;
    return JSON.stringify(rest);
  }, [doc]);

  // Editing pauses playback (like CapCut), so the frame under the playhead doesn't jump mid-play.
  const commit = useCallback(
    (next: EditDocument) => {
      setPlaying(false);
      commitDoc(projectId, next);
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

  const editWord = (i: number) => {
    if (!doc) return;
    const current = overrides.get(i) ?? words[i]?.text ?? '';
    Alert.prompt(
      'Fix this word',
      'The caption uses your spelling.',
      (text) => {
        if (text == null) return;
        const rest = doc.wordOverrides.filter((o) => o.wordIndex !== i);
        const trimmed = text.trim();
        commit({ ...doc, wordOverrides: trimmed === words[i]?.text ? rest : [...rest, { wordIndex: i, text: trimmed }] });
      },
      'plain-text',
      current,
    );
  };

  const sourceAt = (comp: number) => {
    const segs = plan?.segments ?? [];
    for (const s of segs) if (comp <= s.compEnd) return s.start + Math.max(0, comp - s.compStart);
    return segs.length ? segs[segs.length - 1].end : 0;
  };
  const srcTime = sourceAt(time);
  const activeWord = words.findIndex((w) => srcTime >= w.start && srcTime <= w.end);

  // Scrubbing: the native view keeps only the newest seek target while one is in flight, so send every move.
  const onScrubStart = useCallback(() => setPlaying(false), []);
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
  const selected = selection && selection.key === docJSON ? selection.region : null;
  const onSelect = useCallback((region: Region | null) => setSelection(region ? { region, key: docJSON } : null), [docJSON]);

  const splitAtPlayhead = () => {
    if (!doc) return;
    const seg = segments.find((g) => time > g.compStart + 0.15 && time < g.compEnd - 0.15);
    if (!seg || compSplits.some((c) => Math.abs(c - time) < 0.15)) {
      Alert.alert('Can’t split here', 'Move the playhead inside a clip, away from its edges.');
      return;
    }
    setPlaying(false);
    commit({ ...doc, splits: [...(doc.splits ?? []), seg.start + (time - seg.compStart)] });
  };

  const deleteSelected = () => {
    if (!doc || !selected || !plan) return;
    if (regionsOf(segments, compSplits, plan.compDuration).length <= 1) {
      Alert.alert('Can’t delete the whole video', 'Split it first, then delete the part you don’t want.');
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

  const applyLevels = async (next: { silence: SilenceLevel; fillers: FillerLevel }) => {
    // Only the newest tap wins, and it applies to the document as it is when the result arrives.
    const request = ++levelsRequest.current;
    try {
      const suggested = await Engine.suggestCuts(projectId, {
        silence: next.silence,
        fillers: next.fillers,
        language: analysis?.transcript?.language ?? 'auto',
      });
      const latest = useLibrary.getState().docs[projectId];
      if (request !== levelsRequest.current || !latest) return;
      commit({ ...latest, levels: next, cuts: [...latest.cuts.filter((c) => c.reason === 'manual'), ...suggested] });
    } catch (e) {
      Alert.alert('Couldn’t update cuts', errorText(e));
    }
  };

  const showInfo = () => {
    const t = analysis?.transcript;
    const lines = [
      `Speech engine: ${t ? `${t.engine === 'apple' ? 'Apple (on device)' : t.engine}, ${t.language}` : 'none'}`,
      t ? `Word timing: ${t.wordTimingIsExact ? 'per word' : 'per phrase (estimated)'}` : '',
      t ? `Timed runs: ${t.stats.runCount}, ${(t.stats.singleWordRunRatio * 100).toFixed(0)}% single words` : '',
      t ? `Filler words found: ${t.stats.lexicalFillerCount}` : '',
      t ? `Transcribed in ${t.stats.elapsedSec.toFixed(1)} s` : '',
      analysis ? `Speech coverage: ${(analysis.speechCoverage * 100).toFixed(0)}%` : '',
      project?.media ? `${Math.round(project.media.fps)} fps · ${project.media.isHDR ? 'HDR source, exported as SDR' : 'SDR'}` : '',
      ...(analysis?.warnings ?? []),
    ].filter(Boolean);
    Alert.alert(project?.title ?? 'Video info', lines.join('\n'));
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
            <ActivityIndicator color="#FFFFFF" />
            <AppText variant="label" color={colors.textSecondary}>
              {doc ? 'Loading…' : 'Still analysing this clip…'}
            </AppText>
          </>
        )}
        <OutlineButton title="Go back" height={44} onPress={() => router.back()} />
      </View>
    );
  }

  const candidates = doc.cuts.filter((c) => !c.accepted && c.reason === 'filler' && c.confidence < 0.9);
  const acceptedFillers = doc.cuts.filter((c) => c.accepted && c.reason === 'filler').length;
  const acceptedPauses = doc.cuts.filter((c) => c.accepted && c.reason === 'silence').length;
  const total = plan?.compDuration ?? project.media?.durationSec ?? 0;
  const muted = doc.audio.mode === 'mute';
  const aspect = aspectOf(doc.crop);
  // Size the preview frame to the output's shape so there are no bars around the video.
  const frameAspect = rendered && rendered.aspect === aspect ? rendered.value : aspectRatioValue(aspect, project.media ?? undefined);
  const maxW = screenW - spacing.gutter * 2;
  const maxH = Math.min(460, screenH * 0.46);
  const frameW = Math.min(maxW, maxH * frameAspect);
  const frameH = frameW / frameAspect;
  const currentLevels = doc.levels ?? {
    silence: batch?.preset.analysis.silence ?? 'medium',
    fillers: batch?.preset.analysis.fillers ?? 'standard',
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <View style={styles.flex}>
      <Background />
      <View style={[styles.flex, { paddingTop: insets.top + 4 }]}>
        <View style={styles.gutter}>
          <ScreenHeader
            title="Tenfold Editor"
            right={
              <>
                <IconButton icon="ellipsis" label="Video info" size={40} iconScale={0.5} onPress={showInfo} />
                <OutlineButton
                  title="Export"
                  height={40}
                  onPress={() => {
                    setPlaying(false);
                    router.push({ pathname: '/export/[projectId]', params: { projectId } });
                  }}
                />
              </>
            }
          />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          <View style={styles.gutter}>
            <View style={[styles.previewSlot, { height: frameH }]}>
            <View style={[styles.preview, { width: frameW, height: frameH }]}>
              <TenfoldPreviewView
                ref={preview}
                projectId={projectId}
                document={previewJSON}
                playing={playing}
                muted={muted}
                style={StyleSheet.absoluteFill}
                // Only playback drives the clock; scrubs and taps set the time themselves.
                onTime={(e) => {
                  if (playing) setTime(e.nativeEvent.time);
                }}
                onReady={(e) => {
                  setPreviewReady(true);
                  setPreviewError(null);
                  const { width, height } = e.nativeEvent;
                  if (width > 0 && height > 0) setRendered({ aspect, value: width / height });
                }}
                onEnd={() => setPlaying(false)}
                onPlayingChange={(e) => setPlaying(e.nativeEvent.playing)}
                onError={(e) => setPreviewError(e.nativeEvent.message)}
              />
              {/* Tap the video to play or pause. */}
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setPlaying((p) => !p)}
                accessibilityRole="button"
                accessibilityLabel={playing ? 'Pause' : 'Play'}>
                {!playing && previewReady && (
                  <View style={styles.bigPlay} pointerEvents="none">
                    <SymbolView name="play.fill" size={26} tintColor="#FFFFFF" />
                  </View>
                )}
              </Pressable>
              {previewError && (
                <View style={styles.previewErrorBox} pointerEvents="none">
                  <AppText variant="caption">Preview couldn’t update: {previewError}</AppText>
                </View>
              )}
              {!previewReady && (
                <View style={styles.previewLoading} pointerEvents="none">
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              )}
              <View style={styles.badge} pointerEvents="none">
                <SymbolView name="sparkles" size={14} tintColor={colors.textPrimary} />
                <AppText variant="label">Auto-edited</AppText>
              </View>
            </View>
            </View>
          </View>

          <View style={[styles.gutter, styles.transport]}>
            <View style={styles.transportSide}>
              <IconButton icon="arrow.uturn.backward" label="Undo" tone="ghost" size={36} iconScale={0.6} onPress={undo} disabled={!canUndo} />
              <IconButton icon="arrow.uturn.forward" label="Redo" tone="ghost" size={36} iconScale={0.6} onPress={redo} disabled={!canRedo} />
            </View>
            <PressableScale
              onPress={() => setPlaying((p) => !p)}
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Play'}
              scaleTo={0.9}
              style={styles.play}>
              <SymbolView name={playing ? 'pause.fill' : 'play.fill'} size={26} tintColor="#FFFFFF" />
            </PressableScale>
            <View style={[styles.transportSide, styles.transportRight]}>
              <AppText variant="caption" color={colors.textSecondary}>
                {formatDuration(time)} / {formatDuration(total)}
              </AppText>
            </View>
          </View>

          <View style={[styles.gutter, styles.tools]}>
            <ToolButton icon="scissors" label="Cuts" active={tool === 'cuts'} onPress={() => setTool(tool === 'cuts' ? null : 'cuts')} />
            <ToolButton icon="text.quote" label="Words" active={tool === 'words'} onPress={() => setTool(tool === 'words' ? null : 'words')} />
            <ToolButton
              icon="captions.bubble"
              label="Captions"
              onPress={() => {
                setPlaying(false);
                router.push({ pathname: '/editor/captions', params: { projectId } });
              }}
            />
            <ToolButton icon="plus.magnifyingglass" label="Zoom" active={tool === 'zoom'} onPress={() => setTool(tool === 'zoom' ? null : 'zoom')} />
            <ToolButton icon="crop" label="Crop" active={tool === 'crop'} onPress={() => setTool(tool === 'crop' ? null : 'crop')} />
            <ToolButton icon="waveform" label="Audio" active={tool === 'audio'} onPress={() => setTool(tool === 'audio' ? null : 'audio')} />
          </View>

          {plan && (
            <Timeline
              segments={segments}
              compDuration={plan.compDuration}
              cards={plan.cards}
              envelopeDb={analysis.envelopeDb}
              thumbs={thumbs}
              splits={compSplits}
              selected={selected}
              time={time}
              muted={muted}
              onScrubStart={onScrubStart}
              onScrub={onScrub}
              onScrubEnd={onScrubEnd}
              onSelect={onSelect}
              onSplit={splitAtPlayhead}
              onToggleMute={() => commit({ ...doc, audio: { mode: muted ? 'original' : 'mute' } })}
            />
          )}

          {plan && (
            <View style={[styles.gutter, styles.editBar]}>
              <EditAction icon="scissors" label="Split" onPress={splitAtPlayhead} />
              <EditAction icon="trash" label="Delete" onPress={deleteSelected} disabled={!selected} danger />
              <AppText variant="caption" color={colors.textMuted} style={styles.editHint} numberOfLines={2}>
                {selected ? 'Clip selected. Delete removes it, undo brings it back.' : 'Drag the strip to scrub. Tap a clip to select it.'}
              </AppText>
            </View>
          )}

          <View style={[styles.gutter, styles.panel]}>
            {tool === null && !suggestionDismissed && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <SuggestionCard
                  title="Tenfold suggestion"
                  body={
                    analysis.noSpeech
                      ? 'No speech found in this clip, so nothing was cut and captions are off.'
                      : candidates.length > 0
                        ? `Cut ${plural(acceptedFillers, 'filler word', 'filler words')} and ${plural(acceptedPauses, 'pause', 'pauses')}. ${plural(candidates.length, 'more spot sounds', 'more spots sound')} like filler.`
                        : `Cut ${plural(acceptedFillers, 'filler word', 'filler words')} and ${plural(acceptedPauses, 'pause', 'pauses')}, saving ${(plan?.removedSec ?? 0).toFixed(1)} s.`
                  }
                  primary={candidates.length > 0 ? 'Cut them' : 'Review'}
                  secondary={candidates.length > 0 ? 'Review' : 'Dismiss'}
                  onPrimary={() =>
                    candidates.length > 0
                      ? commit({ ...doc, cuts: doc.cuts.map((c) => (candidates.some((x) => x.id === c.id) ? { ...c, accepted: true } : c)) })
                      : setTool('words')
                  }
                  onSecondary={() => (candidates.length > 0 ? setTool('words') : setSuggestionDismissed(true))}
                />
              </Animated.View>
            )}

            {tool === 'words' && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Card style={styles.panelCard}>
                  <View style={styles.panelHead}>
                    <AppText variant="bodyStrong">Transcript</AppText>
                    <AppText variant="caption" color={colors.textMuted}>
                      Tap a word to cut or restore it. Hold to fix its spelling.
                    </AppText>
                  </View>
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
                        const text = overrides.get(i) ?? w.text;
                        return (
                          <PressableScale
                            key={i}
                            scaleTo={0.9}
                            onPress={() => toggleWord(i)}
                            onLongPress={() => editWord(i)}
                            accessibilityLabel={`${text}${removed ? ', removed' : candidate ? ', possible filler' : ''}`}
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
                </Card>
              </Animated.View>
            )}

            {tool === 'cuts' && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Card style={styles.panelCard}>
                  <View style={styles.statRow}>
                    <Stat value={acceptedPauses} label="Pauses" />
                    <Stat value={acceptedFillers} label="Fillers" />
                    <Stat value={doc.cuts.filter((c) => c.accepted && c.reason === 'manual').length} label="Manual" />
                    <Stat value={plan?.removedSec ?? 0} label="Sec saved" decimals />
                  </View>
                  <OptionLabel>Pause cutting</OptionLabel>
                  <ChipGroup>
                    {SILENCE.map((o) => (
                      <Chip
                        key={o.v}
                        label={o.l}
                        selected={currentLevels.silence === o.v}
                        onPress={() => applyLevels({ ...currentLevels, silence: o.v })}
                      />
                    ))}
                  </ChipGroup>
                  <OptionLabel>Filler words</OptionLabel>
                  <ChipGroup>
                    {FILLERS.map((o) => (
                      <Chip
                        key={o.v}
                        label={o.l}
                        selected={currentLevels.fillers === o.v}
                        onPress={() => applyLevels({ ...currentLevels, fillers: o.v })}
                      />
                    ))}
                  </ChipGroup>
                  <OutlineButton
                    title="Restore everything"
                    icon="arrow.counterclockwise"
                    height={44}
                    onPress={() => commit({ ...doc, cuts: doc.cuts.map((c) => ({ ...c, accepted: false })) })}
                  />
                </Card>
              </Animated.View>
            )}

            {tool === 'zoom' && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Card style={styles.panelCard}>
                  <OptionLabel>Punch-in zoom</OptionLabel>
                  <ChipGroup>
                    {(['off', 'subtle', 'dynamic'] as ZoomMode[]).map((z) => (
                      <Chip
                        key={z}
                        label={z[0].toUpperCase() + z.slice(1)}
                        selected={doc.zoom.mode === z}
                        onPress={() => commit({ ...doc, zoom: { ...doc.zoom, mode: z } })}
                      />
                    ))}
                  </ChipGroup>
                  {doc.zoom.mode !== 'off' && (
                    <>
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
                    </>
                  )}
                  <AppText variant="caption" color={colors.textMuted}>
                    Subtle zooms at every cut to hide the jump. Dynamic also punches in at new sentences.
                  </AppText>
                </Card>
              </Animated.View>
            )}

            {tool === 'crop' && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Card style={styles.panelCard}>
                  <OptionLabel>Aspect ratio</OptionLabel>
                  <View style={styles.aspects}>
                    {ASPECTS.map((a) => {
                      const on = aspect === a.id;
                      const r = aspectRatioValue(a.id, project.media ?? undefined);
                      const box = r >= 1 ? { width: 26, height: 26 / r } : { width: 26 * r, height: 26 };
                      return (
                        <PressableScale
                          key={a.id}
                          scaleTo={0.94}
                          onPress={() => {
                            commit({ ...doc, crop: { auto916: a.id === '9:16', aspect: a.id } });
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${a.label}, ${a.hint}`}
                          style={[styles.aspect, on && styles.aspectOn]}>
                          <View style={styles.aspectIcon}>
                            <View style={[styles.aspectBox, box, on && styles.aspectBoxOn]} />
                          </View>
                          <AppText variant="label" color={on ? colors.textPrimary : colors.textSecondary}>
                            {a.label}
                          </AppText>
                        </PressableScale>
                      );
                    })}
                  </View>
                  <AppText variant="caption" color={colors.textMuted}>
                    {ASPECTS.find((a) => a.id === aspect)?.hint}. Tenfold crops automatically and keeps the speaker in frame.
                  </AppText>
                  <ToggleRow
                    title="Follow face"
                    subtitle={analysis.faces.length ? 'Keep the speaker centred' : 'No face found in this clip'}
                    value={doc.zoom.faceFollow}
                    onChange={(v) => commit({ ...doc, zoom: { ...doc.zoom, faceFollow: v } })}
                  />
                </Card>
              </Animated.View>
            )}

            {tool === 'audio' && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Card style={styles.panelCard}>
                  <ToggleRow title="Mute original audio" value={muted} onChange={(v) => commit({ ...doc, audio: { mode: v ? 'mute' : 'original' } })} />
                  <ToggleRow title="Normalize loudness" subtitle="Coming soon" value={false} onChange={() => {}} disabled />
                </Card>
              </Animated.View>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function EditAction({ icon, label, onPress, disabled, danger }: { icon: 'scissors' | 'trash'; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const tint = disabled ? colors.textMuted : danger ? colors.danger : colors.textPrimary;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      style={[styles.editAction, disabled && styles.editActionOff]}>
      <SymbolView name={icon} size={16} tintColor={tint} />
      <AppText variant="label" color={tint}>
        {label}
      </AppText>
    </PressableScale>
  );
}

function Stat({ value, label, decimals }: { value: number; label: string; decimals?: boolean }) {
  return (
    <View style={styles.stat}>
      <AppText variant="title">{decimals ? value.toFixed(1) : value}</AppText>
      <AppText variant="caption" color={colors.textSecondary}>
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
  preview: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(28,27,35,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  previewErrorBox: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(120,20,30,0.85)',
  },
  bigPlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    paddingLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  editBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
  editAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editActionOff: { opacity: 0.5 },
  editHint: { flex: 1 },
  aspects: { flexDirection: 'row', gap: 8 },
  aspect: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.chipFill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  aspectOn: { borderColor: '#FFFFFF', backgroundColor: colors.cardHigh },
  aspectIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  aspectBox: { borderRadius: 3, borderWidth: 1.5, borderColor: colors.textSecondary },
  aspectBoxOn: { borderColor: '#FFFFFF' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  transportSide: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  transportRight: { justifyContent: 'flex-end' },
  play: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.xl },
  panel: { marginTop: spacing.xl },
  panelCard: { gap: spacing.md },
  panelHead: { gap: 2 },
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
  wordActive: { backgroundColor: '#FFFFFF' },
  wordRemoved: { backgroundColor: colors.dangerSoft },
  wordCandidate: { borderColor: colors.danger, borderStyle: 'dashed' },
  strike: { textDecorationLine: 'line-through' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
});
