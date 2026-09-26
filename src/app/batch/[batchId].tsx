import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cancelBatch, queueExports, retryProject, setPaused, STAGE_LABELS, startBatch, useQueueUI } from '@/batch/queue';
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
  seedOf,
} from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { Engine, type Project } from '@/engine';
import { exportsLeft, useEntitlements } from '@/state/entitlements';
import { formatDuration, projectsOf, useLibrary } from '@/state/library';

export default function ProcessingScreen() {
  const insets = useSafeAreaInsets();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const batch = useLibrary((s) => s.batches[batchId]);
  const allProjects = useLibrary((s) => s.projects);
  const deleteBatch = useLibrary((s) => s.deleteBatch);
  const ent = useEntitlements();
  const limitReached = useQueueUI((s) => s.limitReached);
  const setLimitReached = useQueueUI((s) => s.setLimitReached);

  useEffect(() => {
    if (limitReached) {
      setLimitReached(false);
      router.push('/paywall');
    }
  }, [limitReached, setLimitReached]);

  if (!batch) {
    return (
      <View style={[styles.flex, styles.missing]}>
        <Background />
        <AppText variant="bodyStrong">This batch was deleted.</AppText>
        <OutlineButton title="Back to Home" height={44} onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  if (!batch.startedAt) {
    // Not started yet: setup is the right screen.
    return <Redirect href={{ pathname: '/batch/setup', params: { batchId } }} />;
  }

  const projects = projectsOf(batch, allProjects);
  const analysed = projects.filter((p) => ['ready', 'exportQueued', 'exporting', 'done'].includes(p.status)).length;
  const done = projects.filter((p) => p.status === 'done').length;
  const working = projects.some((p) => ['queued', 'analyzing', 'exportQueued', 'exporting'].includes(p.status));
  const cancelled = projects.filter((p) => p.status === 'cancelled').length;
  // Until anything is exported, the ring shows analysis alone (so "all ready" is a full ring, not half).
  const exporting = projects.some((p) => ['exportQueued', 'exporting', 'done'].includes(p.status));
  const overall = exporting
    ? projects.reduce((sum, p) => {
        if (p.status === 'done') return sum + 1;
        if (p.status === 'ready' || p.status === 'exportQueued') return sum + 0.5;
        if (p.status === 'exporting') return sum + 0.5 + p.progress * 0.5;
        if (p.status === 'analyzing') return sum + p.progress * 0.5;
        return sum;
      }, 0) / Math.max(1, projects.length)
    : projects.reduce((sum, p) => sum + (p.status === 'ready' ? 1 : p.status === 'analyzing' ? p.progress : 0), 0) /
      Math.max(1, projects.length);
  const exportable = projects.filter((p) => p.status === 'ready').map((p) => p.id);
  const inFlight = projects.filter((p) => p.status === 'exportQueued' || p.status === 'exporting').length;
  const left = exportsLeft(ent) - inFlight;
  const allSaved = done === projects.length && projects.every((p) => p.savedToPhotos);

  const exportAll = () => {
    if (exportable.length === 0) return;
    if (left <= 0) {
      router.push('/paywall');
      return;
    }
    const ids = Number.isFinite(left) ? exportable.slice(0, left) : exportable;
    queueExports(ids);
    if (ids.length < exportable.length) {
      Alert.alert('Free plan limit', `Exporting ${ids.length} now. Go Pro for unlimited exports.`, [
        { text: 'Later', style: 'cancel' },
        { text: 'See Pro', onPress: () => router.push('/paywall') },
      ]);
    }
  };

  const more = () =>
    Alert.alert(batch.title, undefined, [
      {
        text: 'Delete batch',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete this batch?', 'Edits and exported files inside Tenfold are removed. Videos already saved to Photos stay.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await cancelBatch(batchId);
                projects.forEach((p) => Engine.deleteProject(p.id).catch(() => {}));
                deleteBatch(batchId);
                router.dismissTo('/');
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const lowPower = Engine.isLowPowerMode();

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 110, gap: spacing.xl }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.gutter}>
          <ScreenHeader
            title={batch.title}
            onBack={() => router.dismissTo('/')}
            right={<OutlineButton title="•••" height={40} onPress={more} />}
          />
        </View>

        <View style={[styles.gutter, styles.summary]}>
          <ProgressRing progress={overall} size={150} stroke={9} />
          <View style={styles.summaryText}>
            <AppText variant="title">
              {done > 0 ? `${done} of ${projects.length} exported` : `${analysed} of ${projects.length} ready`}
            </AppText>
            <View style={styles.onDevice}>
              <SymbolView name="iphone" size={14} tintColor={colors.textSecondary} />
              <AppText variant="label" color={colors.textSecondary}>
                {batch.paused
                  ? working
                    ? 'Paused. Finishing the current clip…'
                    : 'Paused'
                  : working
                    ? 'Editing on your iPhone. Keep Tenfold open.'
                    : cancelled > 0
                      ? `${cancelled} ${cancelled === 1 ? 'clip' : 'clips'} cancelled`
                      : done === projects.length
                        ? 'All done on your iPhone.'
                        : 'Ready to review.'}
              </AppText>
            </View>
            {lowPower && working && (
              <AppText variant="caption" color={colors.orange}>
                Low Power Mode is on, so this will be slower.
              </AppText>
            )}
          </View>
          {working || batch.paused ? (
            <View style={styles.actions}>
              <OutlineButton
                title={batch.paused ? 'Resume' : 'Pause'}
                icon={batch.paused ? 'play' : 'pause'}
                height={42}
                style={styles.flex}
                onPress={() => setPaused(batchId, !batch.paused)}
              />
              <OutlineButton
                title="Cancel"
                icon="xmark"
                height={42}
                style={styles.flex}
                onPress={() =>
                  Alert.alert('Cancel the rest of this batch?', 'Clips that are already done stay. You can resume later.', [
                    { text: 'Keep going', style: 'cancel' },
                    { text: 'Cancel batch', style: 'destructive', onPress: () => cancelBatch(batchId) },
                  ])
                }
              />
            </View>
          ) : cancelled > 0 ? (
            <OutlineButton title={`Resume ${cancelled} ${cancelled === 1 ? 'clip' : 'clips'}`} icon="play" height={42} onPress={() => startBatch(batchId)} />
          ) : null}
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
        {!ent.isPro && Number.isFinite(left) && (
          <AppText variant="caption" color={colors.textSecondary} style={styles.center}>
            {left} free {left === 1 ? 'export' : 'exports'} left this month
          </AppText>
        )}
        <GradientButton
          title={
            exportable.length > 0
              ? `Export ${exportable.length === projects.length ? 'all' : exportable.length} to Photos`
              : allSaved
                ? 'All saved to Photos'
                : done === projects.length
                  ? 'All exported'
                  : 'Export when ready'
          }
          icon="square.and.arrow.down"
          shape="pill"
          disabled={exportable.length === 0}
          onPress={exportAll}
        />
      </View>
    </View>
  );
}

function ProjectRow({ project: p }: { project: Project }) {
  const openable = ['ready', 'exportQueued', 'exporting', 'done'].includes(p.status);
  const label = statusLabel(p);
  const color =
    p.status === 'done' ? colors.success : p.status === 'failed' ? colors.danger : p.status === 'ready' ? colors.textPrimary : '#C9B6FF';
  const busy = ['analyzing', 'exporting'].includes(p.status);

  return (
    <PressableScale
      scaleTo={0.97}
      disabled={!openable && p.status !== 'failed' && p.status !== 'cancelled'}
      accessibilityLabel={`${p.title}, ${label}`}
      onPress={() =>
        p.status === 'failed' || p.status === 'cancelled' ? retryProject(p.id) : router.push({ pathname: '/editor/[projectId]', params: { projectId: p.id } })
      }
      style={styles.row}>
      <Thumb seed={seedOf(p.id)} uri={p.posterUri} style={styles.thumb} />
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {p.title}
        </AppText>
        <View style={styles.meta}>
          <AppText variant="label" color={color} numberOfLines={2} style={styles.flex}>
            {label}
          </AppText>
          <AppText variant="label" color={colors.textMuted}>
            {formatDuration(p.media?.durationSec ?? 0)}
          </AppText>
        </View>
        {busy || p.status === 'queued' || p.status === 'exportQueued' ? <ProgressBar progress={p.progress} height={4} /> : null}
        {p.error && p.status !== 'failed' ? (
          <AppText variant="caption" color={colors.orange} numberOfLines={2}>
            {p.error}
          </AppText>
        ) : p.warnings?.length && p.status === 'ready' ? (
          <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
            {p.warnings[0]}
          </AppText>
        ) : null}
      </View>
      {p.status === 'failed' || p.status === 'cancelled' ? (
        <SymbolView name="arrow.clockwise" size={16} tintColor={colors.textSecondary} />
      ) : openable ? (
        <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} />
      ) : null}
    </PressableScale>
  );
}

function statusLabel(p: Project): string {
  switch (p.status) {
    case 'pending':
      return 'Not started';
    case 'queued':
      return 'Waiting';
    case 'analyzing':
      return STAGE_LABELS[p.stage ?? ''] ?? 'Analysing';
    case 'ready':
      return 'Ready to review';
    case 'exportQueued':
      return p.stage === 'cooling' ? 'Cooling down before export' : 'Waiting to export';
    case 'exporting':
      return `${STAGE_LABELS[p.stage ?? ''] ?? 'Exporting'} ${Math.round(p.progress * 100)}%`;
    case 'done':
      return p.savedToPhotos ? 'Saved to Photos' : 'Exported';
    case 'failed':
      return `Failed: ${p.error ?? 'unknown error'}. Tap to retry.`;
    case 'cancelled':
      return 'Cancelled. Tap to resume.';
    default:
      return p.status;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 16 },
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
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    gap: 8,
    backgroundColor: 'rgba(10,9,14,0.92)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
