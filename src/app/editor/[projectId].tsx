import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, IconButton, PressableScale, RoundTool, ToolPanel } from '@/design/components';
import { colors, fonts, radii, spacing } from '@/design/tokens';
import { pingEngine, TenfoldPreviewView } from '@/engine';
import type { Cut } from '@/engine/types';
import { formatDuration, mockCuts, mockProjects, mockWords } from '@/mock/data';

const RULER = ['00:00', '00:02', '00:04', '00:06', '00:08', '00:10'];

export default function EditorScreen() {
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = mockProjects.find((p) => p.id === projectId) ?? mockProjects[0];
  const [playing, setPlaying] = useState(false);
  const [cuts, setCuts] = useState<Cut[]>(mockCuts);
  const [history, setHistory] = useState<Cut[][]>([]);
  const [future, setFuture] = useState<Cut[][]>([]);
  const nativeAvailable = useMemo(() => pingEngine() === 'pong', []);

  const cutForWord = (i: number) => {
    const w = mockWords[i];
    return cuts.find((c) => c.start <= w.start + 0.01 && c.end >= w.end - 0.01);
  };

  const commit = (next: Cut[]) => {
    setHistory((h) => [...h, cuts]);
    setFuture([]);
    setCuts(next);
    // M2: TenfoldEngine.applyEdits(projectId, editDoc) debounced, preview rebuilds natively.
  };

  const toggleWord = (i: number) => {
    const w = mockWords[i];
    const existing = cutForWord(i);
    if (existing) {
      commit(cuts.map((c) => (c.id === existing.id ? { ...c, accepted: !c.accepted } : c)));
    } else {
      commit([
        ...cuts,
        { id: `m${i}`, start: w.start - 0.03, end: w.end + 0.03, reason: 'manual', accepted: true, confidence: 1 },
      ]);
    }
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

  const removedCount = cuts.filter((c) => c.accepted).length;

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="chevron.left" label="Back" onPress={() => router.back()} />
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.headerTitle}>
          {project.title}
        </AppText>
        <IconButton icon="arrow.uturn.backward" label="Undo" onPress={undo} disabled={!history.length} />
        <IconButton icon="arrow.uturn.forward" label="Redo" onPress={redo} disabled={!future.length} />
      </View>

      <View style={styles.previewWrap}>
        {nativeAvailable ? (
          <TenfoldPreviewView projectId={project.id} playing={playing} style={styles.preview} />
        ) : (
          <View style={[styles.preview, { backgroundColor: project.thumbColor }]}>
            <View style={styles.safeZoneTop} />
            <View style={styles.safeZoneBottom} />
            <View style={styles.captionMock}>
              <AppText style={styles.captionText}>
                the three things <AppText style={[styles.captionText, { color: '#FFE14D' }]}>that</AppText>
              </AppText>
            </View>
          </View>
        )}
      </View>

      <View style={styles.transport}>
        <IconButton icon="gobackward" label="Back 1 second" size={40} />
        <IconButton
          icon={playing ? 'pause.fill' : 'play.fill'}
          label={playing ? 'Pause' : 'Play'}
          size={52}
          onPress={() => setPlaying((p) => !p)}
        />
        <IconButton icon="goforward" label="Forward 1 second" size={40} />
        <AppText variant="caption" color={colors.textSecondary} style={styles.time}>
          0:03 / {formatDuration(project.durationSec)}
        </AppText>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.transcript}>
        {mockWords.map((w, i) => {
          const cut = cutForWord(i);
          const removed = !!cut?.accepted;
          const candidate = !!cut && !cut.accepted && cut.confidence < 0.9;
          return (
            <PressableScale
              key={i}
              scaleTo={0.92}
              onPress={() => toggleWord(i)}
              accessibilityLabel={`${w.text}${removed ? ', removed' : ''}`}
              style={[styles.word, removed && styles.wordRemoved, candidate && styles.wordCandidate]}>
              <AppText variant="chip" color={removed ? colors.danger : colors.chipText} style={removed && styles.strike}>
                {w.text}
              </AppText>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View style={styles.timelineBlock}>
        <View style={styles.ruler}>
          {RULER.map((r) => (
            <AppText key={r} style={styles.rulerText}>
              {r}
            </AppText>
          ))}
        </View>
        <View style={styles.filmstrip}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={[styles.frame, { backgroundColor: project.thumbColor, opacity: 0.75 + (i % 3) * 0.08 }]} />
          ))}
          {cuts
            .filter((c) => c.accepted)
            .map((c) => (
              <View key={c.id} style={[styles.cutMarker, { left: `${Math.min(96, (c.start / 10) * 100)}%` }]} />
            ))}
          <View style={styles.playhead}>
            <View style={styles.playheadDot} />
            <View style={styles.playheadLine} />
            <View style={styles.playheadDot} />
          </View>
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          {removedCount} cuts. Tap a word to cut or restore it.
        </AppText>
      </View>

      <View style={[styles.tools, { paddingBottom: insets.bottom + 8 }]}>
        <ToolPanel>
          <RoundTool icon="scissors" label="Cuts" />
          <RoundTool icon="captions.bubble" label="Captions" onPress={() => router.push('/editor/captions')} />
          <RoundTool icon="plus.magnifyingglass" label="Zoom" />
          <RoundTool
            icon="square.and.arrow.up"
            label="Export"
            onPress={() => router.push({ pathname: '/export/[projectId]', params: { projectId: project.id } })}
          />
        </ToolPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0F1222' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.gutter, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center' },
  previewWrap: { flex: 1, paddingHorizontal: spacing.gutter, paddingVertical: 8, alignItems: 'center' },
  preview: { height: '100%', aspectRatio: 9 / 16, borderRadius: radii.card, borderCurve: 'continuous', overflow: 'hidden' },
  safeZoneTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '12%', backgroundColor: 'rgba(255,90,110,0.12)' },
  safeZoneBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(255,90,110,0.12)',
  },
  captionMock: { position: 'absolute', top: '58%', left: 0, right: 0, alignItems: 'center' },
  captionText: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 6 },
  time: { position: 'absolute', right: spacing.gutter },
  transcript: { paddingHorizontal: spacing.gutter, gap: 6, paddingVertical: 6 },
  word: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    justifyContent: 'center',
    backgroundColor: colors.chipFill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  wordRemoved: { backgroundColor: 'rgba(255,90,110,0.15)' },
  wordCandidate: { borderColor: colors.danger, borderStyle: 'dashed' },
  strike: { textDecorationLine: 'line-through' },
  timelineBlock: { paddingHorizontal: spacing.gutter, gap: 6, paddingTop: 4 },
  ruler: { flexDirection: 'row', justifyContent: 'space-between' },
  rulerText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ruler },
  filmstrip: {
    flexDirection: 'row',
    height: 64,
    borderRadius: radii.thumb,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  frame: { flex: 1, borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.15)' },
  cutMarker: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: colors.danger },
  playhead: { position: 'absolute', left: '30%', top: -2, bottom: -2, alignItems: 'center' },
  playheadLine: { flex: 1, width: 2, backgroundColor: '#FFFFFF' },
  playheadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  tools: { paddingHorizontal: spacing.gutter, paddingTop: 12 },
});
