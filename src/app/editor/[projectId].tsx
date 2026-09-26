import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  Thumb,
  ToggleRow,
  ToolButton,
} from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { Timeline } from '@/editor/Timeline';
import { compDuration, layoutSegments, toSource } from '@/editor/timeMap';
import { pingEngine, TenfoldPreviewView } from '@/engine';
import type { Cut, ZoomMode } from '@/engine/types';
import { captionCards, formatDuration, keepSegments, mockClipDuration, mockCuts, mockProjects, mockWords } from '@/mock/data';

type Tool = 'cuts' | 'words' | 'captions' | 'zoom' | 'crop' | 'audio' | null;

export default function EditorScreen() {
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = mockProjects.find((p) => p.id === projectId) ?? mockProjects[0];
  const nativeAvailable = useMemo(() => pingEngine() === 'pong', []);

  const [cuts, setCuts] = useState<Cut[]>(mockCuts);
  const [history, setHistory] = useState<Cut[][]>([]);
  const [future, setFuture] = useState<Cut[][]>([]);
  const [tool, setTool] = useState<Tool>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0); // composition time
  const [muted, setMuted] = useState(false);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('subtle');
  const [crop916, setCrop916] = useState(true);
  const [faceFollow, setFaceFollow] = useState(true);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const segments = useMemo(() => layoutSegments(keepSegments(cuts, mockClipDuration)), [cuts]);
  const total = compDuration(segments);
  const cards = useMemo(() => captionCards(mockWords), []);
  const candidates = cuts.filter((c) => !c.accepted && c.confidence < 0.9);
  const acceptedFillers = cuts.filter((c) => c.accepted && c.reason === 'filler').length;
  const acceptedPauses = cuts.filter((c) => c.accepted && c.reason === 'silence').length;

  // M0: JS clock stands in for AVPlayer time (M2 drives this from the native onTime event).
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTime((t) => (t + 1 / 30 >= total ? 0 : t + 1 / 30)), 1000 / 30);
    return () => clearInterval(id);
  }, [playing, total]);

  const commit = (next: Cut[]) => {
    setHistory((h) => [...h, cuts]);
    setFuture([]);
    setCuts(next);
    // M2: TenfoldEngine.applyEdits(projectId, editDoc), debounced; the native preview rebuilds.
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setFuture((f) => [cuts, ...f]);
    setHistory((h) => h.slice(0, -1));
    setCuts(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((h) => [...h, cuts]);
    setFuture((f) => f.slice(1));
    setCuts(next);
  };

  const cutForWord = (i: number) => {
    const w = mockWords[i];
    return cuts.find((c) => c.start <= w.start + 0.01 && c.end >= w.end - 0.01);
  };
  const toggleWord = (i: number) => {
    const w = mockWords[i];
    const existing = cutForWord(i);
    if (existing) commit(cuts.map((c) => (c.id === existing.id ? { ...c, accepted: !c.accepted } : c)));
    else commit([...cuts, { id: `m${i}`, start: w.start - 0.03, end: w.end + 0.03, reason: 'manual', accepted: true, confidence: 1 }]);
  };
  const cutAtPlayhead = () => {
    const src = toSource(segments, time);
    const i = mockWords.findIndex((w) => src >= w.start - 0.05 && src <= w.end + 0.05);
    if (i >= 0) toggleWord(i);
  };

  const srcTime = toSource(segments, time);
  const activeWord = mockWords.findIndex((w) => srcTime >= w.start && srcTime <= w.end);

  return (
    <View style={styles.flex}>
      <Background />
      <View style={[styles.flex, { paddingTop: insets.top + 4 }]}>
        <View style={styles.gutter}>
          <ScreenHeader
            title="Video Editor"
            right={
              <>
                <OutlineButton
                  title="Export"
                  height={40}
                  onPress={() => router.push({ pathname: '/export/[projectId]', params: { projectId: project.id } })}
                />
                <IconButton
                  icon="ellipsis"
                  label="More"
                  tone="ghost"
                  size={32}
                  iconScale={0.55}
                  onPress={() =>
                    Alert.alert(project.title, `Speech engine: Apple (on device)\n${project.fps} fps · ${project.isHDR ? 'HDR source, exported as SDR' : 'SDR'}`)
                  }
                />
              </>
            }
          />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          {/* Preview */}
          <View style={styles.gutter}>
            <View style={styles.preview}>
              <Thumb seed={project.thumbSeed} style={StyleSheet.absoluteFill} />
              <View style={styles.previewDim} />
              <View style={styles.previewFrame}>
                {nativeAvailable ? (
                  <TenfoldPreviewView projectId={project.id} playing={playing} style={StyleSheet.absoluteFill} />
                ) : (
                  <Thumb seed={project.thumbSeed} style={StyleSheet.absoluteFill} />
                )}
              </View>
              <View style={styles.badge}>
                <SymbolView name="sparkles" size={14} tintColor={colors.textPrimary} />
                <AppText variant="label">Auto-edited</AppText>
              </View>
            </View>
          </View>

          {/* Transport */}
          <View style={[styles.gutter, styles.transport]}>
            <View style={styles.transportSide}>
              <IconButton icon="arrow.uturn.backward" label="Undo" tone="ghost" size={36} iconScale={0.6} onPress={undo} disabled={!history.length} />
              <IconButton icon="arrow.uturn.forward" label="Redo" tone="ghost" size={36} iconScale={0.6} onPress={redo} disabled={!future.length} />
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
              <IconButton icon="arrow.up.left.and.arrow.down.right" label="Full screen" tone="ghost" size={36} iconScale={0.55} />
            </View>
          </View>

          {/* Tools */}
          <View style={[styles.gutter, styles.tools]}>
            <ToolButton icon="scissors" label="Cuts" active={tool === 'cuts'} onPress={() => setTool(tool === 'cuts' ? null : 'cuts')} />
            <ToolButton icon="text.quote" label="Words" active={tool === 'words'} onPress={() => setTool(tool === 'words' ? null : 'words')} />
            <ToolButton icon="captions.bubble" label="Captions" onPress={() => router.push('/editor/captions')} />
            <ToolButton icon="plus.magnifyingglass" label="Zoom" active={tool === 'zoom'} onPress={() => setTool(tool === 'zoom' ? null : 'zoom')} />
            <ToolButton icon="crop" label="Crop" active={tool === 'crop'} onPress={() => setTool(tool === 'crop' ? null : 'crop')} />
            <ToolButton icon="waveform" label="Audio" active={tool === 'audio'} onPress={() => setTool(tool === 'audio' ? null : 'audio')} />
          </View>

          {/* Timeline */}
          <Timeline
            segments={segments}
            cards={cards}
            words={mockWords}
            time={time}
            playing={playing}
            muted={muted}
            seed={project.thumbSeed}
            onSeek={(t) => {
              setPlaying(false);
              setTime(t);
            }}
            onAddCut={cutAtPlayhead}
            onToggleMute={() => setMuted((m) => !m)}
          />

          {/* Contextual panel */}
          <View style={[styles.gutter, styles.panel]}>
            {tool === null && !suggestionDismissed && (candidates.length > 0 || acceptedFillers + acceptedPauses > 0) && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <SuggestionCard
                  title="Tenfold suggestion"
                  body={
                    candidates.length > 0
                      ? `Removed ${acceptedFillers} filler words and ${acceptedPauses} long pause. ${candidates.length} more ${candidates.length === 1 ? 'word sounds' : 'words sound'} like filler.`
                      : `Removed ${acceptedFillers} filler words and ${acceptedPauses} long pause. Looks clean.`
                  }
                  primary={candidates.length > 0 ? 'Cut them' : 'Review'}
                  secondary={candidates.length > 0 ? 'Review' : 'Dismiss'}
                  onPrimary={() =>
                    candidates.length > 0
                      ? commit(cuts.map((c) => (candidates.some((x) => x.id === c.id) ? { ...c, accepted: true } : c)))
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
                      Tap a word to cut or restore it
                    </AppText>
                  </View>
                  <View style={styles.words}>
                    {mockWords.map((w, i) => {
                      const cut = cutForWord(i);
                      const removed = !!cut?.accepted;
                      const candidate = !!cut && !cut.accepted && cut.confidence < 0.9;
                      return (
                        <PressableScale
                          key={i}
                          scaleTo={0.9}
                          onPress={() => toggleWord(i)}
                          accessibilityLabel={`${w.text}${removed ? ', removed' : candidate ? ', possible filler' : ''}`}
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
                            {w.text}
                          </AppText>
                        </PressableScale>
                      );
                    })}
                  </View>
                </Card>
              </Animated.View>
            )}

            {tool === 'cuts' && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Card style={styles.panelCard}>
                  <AppText variant="bodyStrong">Cuts</AppText>
                  <View style={styles.statRow}>
                    <Stat value={acceptedPauses} label="Pauses" />
                    <Stat value={acceptedFillers} label="Fillers" />
                    <Stat value={cuts.filter((c) => c.accepted && c.reason === 'manual').length} label="Manual" />
                    <Stat value={Math.max(0, mockClipDuration - total)} label="Sec saved" decimals />
                  </View>
                  <OutlineButton
                    title="Restore everything"
                    icon="arrow.counterclockwise"
                    height={44}
                    onPress={() => commit(cuts.map((c) => ({ ...c, accepted: false })))}
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
                      <Chip key={z} label={z[0].toUpperCase() + z.slice(1)} selected={zoomMode === z} onPress={() => setZoomMode(z)} />
                    ))}
                  </ChipGroup>
                  <AppText variant="caption" color={colors.textMuted}>
                    Subtle zooms only at cuts. Dynamic also punches in at new sentences.
                  </AppText>
                </Card>
              </Animated.View>
            )}

            {tool === 'crop' && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Card style={styles.panelCard}>
                  <ToggleRow title="9:16 vertical" subtitle="Reframe for TikTok, Reels and Shorts" value={crop916} onChange={setCrop916} />
                  <ToggleRow title="Follow face" subtitle="Keep the speaker centred" value={faceFollow} onChange={setFaceFollow} />
                </Card>
              </Animated.View>
            )}

            {tool === 'audio' && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Card style={styles.panelCard}>
                  <ToggleRow title="Mute original audio" value={muted} onChange={setMuted} />
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
  gutter: { paddingHorizontal: spacing.gutter },
  preview: {
    height: 300,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,9,14,0.55)' },
  previewFrame: {
    height: '100%',
    aspectRatio: 9 / 16,
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
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
