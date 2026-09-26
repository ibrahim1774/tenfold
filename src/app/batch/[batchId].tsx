import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Background,
  GradientButton,
  OutlineButton,
  PressableScale,
  ProgressBar,
  ProgressRing,
  ScreenHeader,
  Thumb,
} from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import type { Project } from '@/engine/types';
import { formatDuration, mockBatches, projectsForBatch } from '@/mock/data';

export default function ProcessingScreen() {
  const insets = useSafeAreaInsets();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const batch = mockBatches.find((b) => b.id === batchId) ?? mockBatches[0];
  const projects = projectsForBatch(batch);
  const overall = projects.reduce((sum, p) => sum + p.progress, 0) / Math.max(1, projects.length);
  const readyCount = projects.filter((p) => p.status === 'ready' || p.status === 'done').length;
  const allReady = readyCount === projects.length;

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 110, gap: spacing.xl }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.gutter}>
          <ScreenHeader title={batch.title} onBack={() => router.dismissTo('/')} />
        </View>

        <View style={[styles.gutter, styles.summary]}>
          <ProgressRing progress={overall} size={150} stroke={9} />
          <View style={styles.summaryText}>
            <AppText variant="title">
              {readyCount} of {projects.length} ready
            </AppText>
            <View style={styles.onDevice}>
              <SymbolView name="iphone" size={14} tintColor={colors.textSecondary} />
              <AppText variant="label" color={colors.textSecondary}>
                Editing on your iPhone. Keep Tenfold open.
              </AppText>
            </View>
          </View>
          <View style={styles.actions}>
            <OutlineButton title="Pause" icon="pause" height={42} style={styles.flex} />
            <OutlineButton title="Cancel" icon="xmark" height={42} style={styles.flex} onPress={() => router.dismissTo('/')} />
          </View>
        </View>

        <View style={[styles.gutter, styles.list]}>
          {projects.map((p, i) => (
            <Animated.View key={p.id} entering={FadeInDown.delay(40 * i).duration(350)}>
              <ProjectRow project={p} />
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <GradientButton
          title={allReady ? 'Export all to Photos' : `Export all · ${readyCount}/${projects.length} ready`}
          icon="square.and.arrow.down"
          shape="pill"
          disabled={!allReady}
          onPress={() => router.push({ pathname: '/export/[projectId]', params: { projectId: projects[0].id } })}
        />
      </View>
    </View>
  );
}

function ProjectRow({ project: p }: { project: Project }) {
  const ready = p.status === 'ready' || p.status === 'done';
  const label =
    p.status === 'queued' ? 'Waiting' : p.status === 'analyzing' ? (p.stage ?? 'Analyzing') : ready ? 'Ready to review' : p.status;
  const eta = p.status === 'analyzing' ? `~${Math.max(1, Math.round((1 - p.progress) * 20))} s left` : formatDuration(p.durationSec);

  return (
    <PressableScale
      disabled={!ready}
      scaleTo={0.97}
      accessibilityLabel={`${p.title}, ${label}`}
      onPress={() => router.push({ pathname: '/editor/[projectId]', params: { projectId: p.id } })}
      style={styles.row}>
      <Thumb seed={p.thumbSeed} style={styles.thumb} />
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {p.title}
        </AppText>
        <View style={styles.meta}>
          <AppText variant="label" color={ready ? colors.success : p.status === 'queued' ? colors.textMuted : '#C9B6FF'}>
            {label}
          </AppText>
          <AppText variant="label" color={colors.textMuted}>
            {eta}
          </AppText>
        </View>
        {!ready && <ProgressBar progress={p.progress} height={4} />}
      </View>
      {ready && <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gutter: { paddingHorizontal: spacing.gutter },
  summary: { alignItems: 'center', gap: spacing.lg },
  summaryText: { alignItems: 'center', gap: 4 },
  onDevice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch' },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 10,
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 52, height: 76, borderRadius: 12 },
  rowText: { flex: 1, gap: 6 },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    backgroundColor: 'rgba(10,9,14,0.92)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
