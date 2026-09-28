import { Redirect, router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { ActionSheetIOS, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cancelBatch, queueExports, retryProject, setPaused, STAGE_LABELS, startBatch, unpark, useQueueUI } from '@/batch/queue';
import {
  AppText,
  Background,
  GradientButton,
  IconButton,
  OutlineButton,
  PressableScale,
  ProgressRing,
  ScreenHeader,
  Thumb,
  seedOf,
} from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { Engine, type Batch, type Project } from '@/engine';
import { usePaywallGate, type GateRequest } from '@/monetization/superwall';
import { exportsLeft, useEntitlements } from '@/state/entitlements';
import { editsOf, editsSummary } from '@/batch/edits';
import { formatDuration, projectsOf, useLibrary } from '@/state/library';
import { clipsOf, effectiveCuts, playingClipCount, playingSeconds } from '@/editor/clips';

/** Exports left this month after the ones already queued in this batch (read fresh, e.g. after an upgrade). */
function exportRoom(batchId: string) {
  const lib = useLibrary.getState();
  const b = lib.batches[batchId];
  const inFlight = b ? projectsOf(b, lib.projects).filter((p) => p.status === 'exportQueued' || p.status === 'exporting').length : 0;
  return exportsLeft(useEntitlements.getState()) - inFlight;
}

/** Queues this batch's ready videos, as many as this month's exports allow. */
function exportReadyIn(batchId: string) {
  const lib = useLibrary.getState();
  const b = lib.batches[batchId];
  if (!b) return;
  const ready = projectsOf(b, lib.projects).filter((p) => p.status === 'ready').map((p) => p.id);
  const left = exportRoom(batchId);
  if (left <= 0 || ready.length === 0) return;
  queueExports(Number.isFinite(left) ? ready.slice(0, left) : ready);
}

/** export_limit: gated, the ready videos export once the plan has exports left. */
const exportLimitGate = (batchId: string): GateRequest => ({
  placement: 'export_limit',
  params: { batchId },
  allowed: () => exportRoom(batchId) > 0,
  run: () => exportReadyIn(batchId),
});

export default function ProcessingScreen() {
  const insets = useSafeAreaInsets();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const batch = useLibrary((s) => s.batches[batchId]);
  const allProjects = useLibrary((s) => s.projects);
  const deleteBatch = useLibrary((s) => s.deleteBatch);
  const ent = useEntitlements();
  const parked = useQueueUI((s) => s.parked);
  const focused = useIsFocused();
  const gate = usePaywallGate();

  // The export lane stopped at the monthly limit with videos from this batch waiting: show export_limit here,
  // only while this screen is on top (an export screen above it handles its own video).
  const parkedHere = !!batch && parked.some((id) => batch.projectIds.includes(id));
  useEffect(() => {
    if (focused && parkedHere) {
      const b = useLibrary.getState().batches[batchId];
      if (b) unpark(b.projectIds);
      gate(exportLimitGate(batchId));
    }
  }, [focused, parkedHere, gate, batchId]);

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
  const analysed = projects.filter(analysedStatus).length;
  const done = projects.filter((p) => p.status === 'done').length;
  const working = projects.some((p) => ['queued', 'analyzing', 'exportQueued', 'exporting'].includes(p.status));
  const cancelled = projects.filter((p) => p.status === 'cancelled').length;
  // Until anything is exported, the ring shows analysis alone (so "all ready" is a full ring, not half).
  const exporting = projects.some((p) => ['exportQueued', 'exporting', 'done'].includes(p.status));
  // The ring measures what the headline counts: exports once any exist, otherwise analysis.
  const overall =
    projects.reduce((sum, p) => {
      if (exporting) return sum + (p.status === 'done' ? 1 : p.status === 'exporting' ? p.progress : 0);
      return sum + (analysedStatus(p) ? 1 : p.status === 'analyzing' ? p.progress : 0);
    }, 0) / Math.max(1, projects.length);
  const exportable = projects.filter((p) => p.status === 'ready').map((p) => p.id);
  const inFlight = projects.filter((p) => p.status === 'exportQueued' || p.status === 'exporting').length;
  const left = exportsLeft(ent) - inFlight;
  const allSaved = done === projects.length && projects.every((p) => p.savedToPhotos);

  const exportAll = () => {
    if (exportable.length === 0) return;
    if (left <= 0) {
      gate(exportLimitGate(batchId));
      return;
    }
    const ids = Number.isFinite(left) ? exportable.slice(0, left) : exportable;
    queueExports(ids);
    if (ids.length < exportable.length) {
      Alert.alert('Monthly export limit', `Exporting ${ids.length} now. The rest can export on a bigger plan or next month.`, [
        { text: 'Later', style: 'cancel' },
        { text: 'See plans', onPress: () => gate(exportLimitGate(batchId)) },
      ]);
    }
  };

  const confirmDelete = () =>
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
    ]);

  const more = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: batch.title, options: ['Delete batch', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
      (i) => {
        if (i === 0) confirmDelete();
      },
    );

  const confirmCancel = () =>
    Alert.alert('Cancel the rest of this batch?', 'Clips that are already done stay. You can resume later.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Cancel batch', style: 'destructive', onPress: () => cancelBatch(batchId) },
    ]);

  const lowPower = Engine.isLowPowerMode();
  const total = projects.length;
  const failed = projects.filter((p) => p.status === 'failed').length;
  const headline = exporting ? `${done} of ${total} exported` : `${analysed} of ${total} ready`;
  const activity = activityLine({ projects, paused: !!batch.paused, working, cancelled, failed, done, allSaved });
  const percent = Math.round(overall * 100);

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.gutter}>
          <ScreenHeader
            title={batch.title}
            onBack={() => router.dismissTo('/')}
            right={<IconButton icon="ellipsis" label="More actions" size={46} onPress={more} />}
          />
        </View>

        {/* Summary: facts, with a real number. */}
        <View style={[styles.gutter, styles.summary]}>
          <View style={styles.summaryRow} accessible accessibilityLabel={`${headline}. ${activity}. ${percent} percent`}>
            <View>
              <ProgressRing progress={overall} size={84} stroke={6} showLabel={false} />
              <View style={styles.ringLabel} pointerEvents="none">
                <AppText variant="chip" tabular>
                  {percent}%
                </AppText>
              </View>
            </View>
            <View style={styles.summaryText}>
              <AppText variant="title" tabular>
                {headline}
              </AppText>
              <AppText variant="label" color={colors.textSecondary} tabular numberOfLines={2}>
                {activity}
              </AppText>
              {working && !batch.paused && (
                <View style={styles.onDevice}>
                  <SymbolView name="iphone" size={12} tintColor={colors.textMuted} weight="regular" />
                  <AppText variant="caption" color={colors.textMuted}>
                    On this iPhone · keep Tenfold open
                  </AppText>
                </View>
              )}
              {lowPower && working && (
                <AppText variant="caption" color={colors.orange}>
                  Low Power Mode is on, so this is slower.
                </AppText>
              )}
            </View>
          </View>

          {working || batch.paused ? (
            <View style={styles.actions}>
              <OutlineButton
                title={batch.paused ? 'Resume' : 'Pause'}
                icon={batch.paused ? 'play' : 'pause'}
                height={44}
                style={styles.flex}
                onPress={() => setPaused(batchId, !batch.paused)}
              />
              <OutlineButton title="Cancel" icon="xmark" height={44} style={styles.flex} onPress={confirmCancel} />
            </View>
          ) : cancelled > 0 ? (
            <OutlineButton
              title={`Resume ${cancelled} ${cancelled === 1 ? 'clip' : 'clips'}`}
              icon="play"
              height={44}
              onPress={() => startBatch(batchId)}
            />
          ) : null}
        </View>

        {/* Results: every video, tap one to review, adjust and export it. */}
        <View style={[styles.gutter, styles.grid]}>
          {projects.map((p) => (
            <ResultCard key={p.id} project={p} batch={batch} saved={savedSec(p)} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {Number.isFinite(left) && (
          <AppText variant="caption" color={colors.textSecondary} style={styles.center} tabular>
            {Math.max(0, left)} {left === 1 ? 'export' : 'exports'} left this month
          </AppText>
        )}
        {exportable.length === 0 && done < total && (
          <AppText variant="caption" color={colors.textMuted} style={styles.center}>
            {inFlight > 0 ? 'Exporting now.' : 'Videos can be exported once they are ready.'}
          </AppText>
        )}
        <GradientButton
          title={
            exportable.length > 0
              ? `Export ${exportable.length} ${exportable.length === 1 ? 'video' : 'videos'}`
              : allSaved
                ? 'All saved to Photos'
                : done === total
                  ? 'All exported'
                  : 'Export videos'
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

/** One line of fact about what the batch is doing right now, e.g. "Clip 4 · Transcribing". */
function activityLine({
  projects,
  paused,
  working,
  cancelled,
  failed,
  done,
  allSaved,
}: {
  projects: Project[];
  paused: boolean;
  working: boolean;
  cancelled: number;
  failed: number;
  done: number;
  allSaved: boolean;
}): string {
  const active = projects.find((p) => p.status === 'exporting') ?? projects.find((p) => p.status === 'analyzing');
  const n = active ? projects.indexOf(active) + 1 : 0;
  if (paused) return working && active ? `Paused · finishing clip ${n}` : 'Paused';
  if (active?.status === 'exporting')
    return `Clip ${n} · ${STAGE_LABELS[active.stage ?? ''] ?? 'Exporting'} · ${Math.round(active.progress * 100)}%`;
  if (active) return `Clip ${n} · ${STAGE_LABELS[active.stage ?? ''] ?? 'Analysing'}`;
  if (projects.some((p) => p.status === 'exportQueued' && p.stage === 'cooling')) return 'Cooling down before the next export';
  if (working) return 'Starting';
  const notes: string[] = [];
  if (failed > 0) notes.push(`${failed} failed`);
  if (cancelled > 0) notes.push(`${cancelled} cancelled`);
  if (notes.length > 0) return `${notes.join(' · ')} · tap a video to retry`;
  if (done === projects.length) return allSaved ? 'All saved to Photos' : 'All exported';
  return 'Tap a video to review it';
}

function analysedStatus(p: Project): boolean {
  return ['ready', 'exportQueued', 'exporting', 'done'].includes(p.status);
}

/** Seconds removed by the applied cuts (overlaps merged), for the "1:12 → 0:58" line. */
function savedSec(p: Project): number {
  const doc = useLibrary.getState().docs[p.id];
  if (!doc) return 0;
  // Every clip that plays, with its trims.
  const dur = playingSeconds(p, doc);
  const cuts = effectiveCuts(doc, clipsOf(p))
    .filter((c) => c.accepted)
    .map((c) => [Math.max(0, c.start), Math.min(dur, c.end)] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -1;
  for (const [a, b] of cuts) {
    if (a > end) {
      total += b - a;
      end = b;
    } else if (b > end) {
      total += b - end;
      end = b;
    }
  }
  return total;
}

function ResultCard({ project: p, batch, saved }: { project: Project; batch: Batch; saved: number }) {
  const openable = ['ready', 'exportQueued', 'exporting', 'done'].includes(p.status);
  const retryable = p.status === 'failed' || p.status === 'cancelled';
  const running = p.status === 'analyzing' || p.status === 'exporting';
  const waiting = p.status === 'queued' || p.status === 'exportQueued' || p.status === 'pending';
  const label = statusLabel(p);
  const doc = useLibrary((s) => s.docs[p.id]);
  const dur = playingSeconds(p, doc);
  const clips = playingClipCount(p, doc);
  const trimmed = openable && saved > 0.5;
  const durText = trimmed ? `${formatDuration(dur)} → ${formatDuration(dur - saved)}` : formatDuration(dur);
  const status = openable && !p.error ? (p.status === 'done' ? label : editsSummary(editsOf(p, batch))) : p.error && p.status !== 'failed' ? p.error : label;
  const detail = clips > 1 ? `${clips} clips · ${status}` : status;

  return (
    <PressableScale
      haptic={false}
      disabled={!openable && !retryable}
      accessibilityRole="button"
      accessibilityLabel={`${p.title}, ${durText.replace('→', 'to')}, ${label}`}
      accessibilityHint={retryable ? 'Tries this video again' : openable ? 'Opens the video to review and export' : undefined}
      accessibilityState={{ disabled: !openable && !retryable, busy: running || waiting }}
      onPress={() => (retryable ? retryProject(p.id) : router.push({ pathname: '/editor/[projectId]', params: { projectId: p.id } }))}
      style={styles.card}>
      <Thumb seed={seedOf(p.id)} uri={p.posterUri} style={styles.poster}>
        {(running || waiting || retryable) && (
          <View style={[styles.posterCenter, styles.posterDim]}>
            {running ? (
              <View>
                <ProgressRing progress={p.progress} size={48} stroke={3} showLabel={false} />
                <View style={styles.ringLabel}>
                  <AppText variant="caption" tabular>
                    {Math.round(p.progress * 100)}
                  </AppText>
                </View>
              </View>
            ) : retryable ? (
              <View style={styles.posterBadge}>
                <SymbolView name="arrow.clockwise" size={16} tintColor={colors.textPrimary} weight="regular" />
              </View>
            ) : (
              <SymbolView name="clock" size={18} tintColor={colors.textSecondary} weight="regular" />
            )}
          </View>
        )}
        {p.status === 'done' && (
          <View style={styles.doneBadge}>
            <SymbolView name="checkmark" size={12} weight="regular" tintColor={colors.textInverse} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <AppText variant="caption" tabular>
            {durText}
          </AppText>
        </View>
      </Thumb>
      <View style={styles.cardText}>
        <AppText variant="chip" numberOfLines={1}>
          {p.title}
        </AppText>
        <AppText
          variant="caption"
          numberOfLines={2}
          tabular
          color={p.status === 'failed' ? colors.danger : p.error ? colors.orange : colors.textMuted}>
          {detail}
        </AppText>
      </View>
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
  missing: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: spacing.gutter },
  gutter: { paddingHorizontal: spacing.gutter },
  summary: { gap: spacing.lg, marginTop: spacing.md, marginBottom: spacing.xxl },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  summaryText: { flex: 1, gap: 2 },
  ringLabel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  onDevice: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  actions: { flexDirection: 'row', gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xl },
  card: { width: '48%', flexGrow: 1, maxWidth: '50%', gap: spacing.sm },
  cardText: { gap: 2 },
  poster: { width: '100%', aspectRatio: 9 / 13, borderRadius: radii.tile, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  posterCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  posterDim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  posterBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
  doneBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  durationBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.overlay,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
