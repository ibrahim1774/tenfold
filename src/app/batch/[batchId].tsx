import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Background,
  GlassCard,
  GradientButton,
  PressableScale,
  ProgressBar,
  ProgressRing,
  ScreenHeader,
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
      <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 110, gap: spacing.lg }}>
        <View style={styles.gutter}>
          <ScreenHeader title={batch.title} onBack={() => router.dismissTo('/')} />
        </View>

        <View style={[styles.gutter, styles.summary]}>
          <ProgressRing progress={overall} size={140} />
          <AppText variant="bodyStrong">
            {readyCount} of {projects.length} ready
          </AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            Runs on your iPhone. Keep the app open.
          </AppText>
          <View style={styles.actions}>
            <PressableScale style={styles.secondary} accessibilityRole="button">
              <AppText variant="bodyStrong">Pause</AppText>
            </PressableScale>
            <PressableScale style={styles.secondary} accessibilityRole="button" onPress={() => router.dismissTo('/')}>
              <AppText variant="bodyStrong" color={colors.danger}>
                Cancel batch
              </AppText>
            </PressableScale>
          </View>
        </View>

        <View style={[styles.gutter, styles.list]}>
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <GradientButton
          title={allReady ? 'Export all' : `Export all (${readyCount}/${projects.length} ready)`}
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
    p.status === 'queued' ? 'Queued' : p.status === 'analyzing' ? (p.stage ?? 'Analyzing') : ready ? 'Ready to edit' : p.status;
  const eta = p.status === 'analyzing' ? `~${Math.max(1, Math.round((1 - p.progress) * 20))} s` : '';

  return (
    <PressableScale
      disabled={!ready}
      accessibilityLabel={`${p.title}, ${label}`}
      onPress={() => router.push({ pathname: '/editor/[projectId]', params: { projectId: p.id } })}>
      <GlassCard style={styles.row} padded={false}>
        <View style={styles.rowInner}>
          <View style={[styles.thumb, { backgroundColor: p.thumbColor }]} />
          <View style={styles.rowText}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {p.title}
            </AppText>
            <View style={styles.meta}>
              <AppText variant="caption" color={ready ? colors.success : colors.textSecondary}>
                {label}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {eta || formatDuration(p.durationSec)}
              </AppText>
            </View>
            <ProgressBar progress={p.progress} />
          </View>
        </View>
      </GlassCard>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gutter: { paddingHorizontal: spacing.gutter },
  summary: { alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  secondary: {
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    backgroundColor: 'rgba(22,26,48,0.6)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  list: { gap: spacing.md },
  row: { borderRadius: 24 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  thumb: { width: 54, height: 80, borderRadius: radii.thumb - 4 },
  rowText: { flex: 1, gap: 6 },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    backgroundColor: 'rgba(15,18,34,0.85)',
  },
});
