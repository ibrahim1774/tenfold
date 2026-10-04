import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queueExports, STAGE_LABELS, unpark, useQueueUI } from '@/batch/queue';
import {
  AppText,
  Background,
  GlassSurface,
  GradientButton,
  IconButton,
  OutlineButton,
  ProgressRing,
  ScreenHeader,
  Thumb,
  seedOf,
} from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { usePaywallGate } from '@/monetization/superwall';
import { limitsFor, lowestTierWhere } from '@/onboarding/plans';
import { exportsLeft, tierOf, TIER_NAMES, useEntitlements } from '@/state/entitlements';
import { useLibrary } from '@/state/library';

const RING = 96;

const inFlightCount = (projects: ReturnType<typeof useLibrary.getState>['projects']) =>
  Object.values(projects).filter((p) => p.status === 'exportQueued' || p.status === 'exporting').length;

/** Exports left this month after the ones already queued or running (read fresh, e.g. after an upgrade). */
function exportRoom() {
  return exportsLeft(useEntitlements.getState()) - inFlightCount(useLibrary.getState().projects);
}

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = useLibrary((s) => s.projects[projectId]);
  // Exports queued or running anywhere: the lane is shared, so they count against this month's limit.
  const inFlight = useLibrary((s) => inFlightCount(s.projects));
  const parkedHere = useQueueUI((s) => s.parked.includes(projectId));
  const focused = useIsFocused();
  const ent = useEntitlements();
  const tier = tierOf(ent);
  const { watermark } = limitsFor(tier);
  const gate = usePaywallGate();
  // When this screen started an export (0 = not yet), to tell a fresh export from an older one.
  const [startedAt, setStartedAt] = useState(0);
  const busy = project?.status === 'exportQueued' || project?.status === 'exporting';
  // Started here, then put back to ready without an error: the queue stopped at the monthly export limit
  // while this video waited behind others. Back to the choices (the effect below shows export_limit).
  const stoppedAtLimit = startedAt > 0 && project?.status === 'ready' && !project.error;
  // Also "started" when coming back to an export that's already running.
  const started = (startedAt > 0 && !stoppedAtLimit) || busy;
  const finished = started && project?.status === 'done' && (project.exportedAt ?? 0) >= startedAt;
  const failed = started && !busy && !finished && !!project?.error;

  // One success tick when the export lands, never again for this screen.
  const celebrated = useRef(false);
  useEffect(() => {
    if (finished && !celebrated.current) {
      celebrated.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [finished]);

  const exportNow = () => {
    setStartedAt(Date.now());
    queueExports([projectId]);
  };
  // export_limit: gated, the export starts once the plan has room for it.
  const limitGate = () =>
    gate({
      placement: 'export_limit',
      params: { tier },
      allowed: () => exportRoom() > 0,
      run: exportNow,
    });

  // This video was parked at the monthly limit: the export_limit paywall here, instead of a ring that
  // never moves (and instead of on some other screen later).
  useEffect(() => {
    if (!focused || !parkedHere) return;
    unpark([projectId]);
    limitGate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, parkedHere, projectId]);

  if (!project) return null;

  // Shown while choosing, when this video isn't in flight itself.
  const left = Math.max(0, exportsLeft(ent) - inFlight);
  const choosing = !started || failed;
  const saved = finished && !!project.savedToPhotos;
  const cleanTier = lowestTierWhere((l) => !l.watermark) ?? 'starter';

  const start = () => {
    if (exportRoom() > 0) {
      exportNow();
      return;
    }
    // Out of exports this month (counting the ones already queued): gated.
    limitGate();
  };
  const seePlans = (feature: string) => gate({ placement: 'settings_upgrade', params: { feature }, allowed: () => false });

  const share = async () => {
    if (!project.exportUri) return;
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
      await Sharing.shareAsync(project.exportUri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
    } catch (e) {
      Alert.alert('Couldn’t share', e instanceof Error ? e.message : String(e));
    }
  };

  const openTikTok = async () => {
    const can = await Linking.canOpenURL('tiktok://').catch(() => false);
    await Linking.openURL(can ? 'tiktok://' : 'photos-redirect://').catch(() => {
      Alert.alert('Couldn’t open TikTok', 'Your video is in Photos. Open TikTok and pick it from your camera roll.');
    });
  };

  const title = choosing ? 'Export' : finished ? (saved ? 'Saved to Photos' : 'Not saved to Photos') : 'Exporting';
  const percent = Math.round(Math.max(0, Math.min(1, project.progress)) * 100);
  const stage =
    project.status === 'exportQueued' ? 'Waiting for the current export to finish' : (STAGE_LABELS[project.stage ?? ''] ?? 'Exporting');

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + spacing.lg }]}>
      <Background />
      {/* Small centred title with the glass Close in the leading corner, like an iOS 26 sheet. */}
      <ScreenHeader title={title} left={<IconButton icon="xmark" label="Close" onPress={() => router.back()} />} />
      <AppText variant="label" color={colors.textSecondary} style={[styles.center, styles.subtitle]} numberOfLines={1}>
        {project.title}
      </AppText>

      <View style={styles.middle}>
        {choosing ? (
          <View style={styles.choose}>
            {!failed && height >= 740 ? <Thumb seed={seedOf(project.id)} uri={project.posterUri} style={styles.poster} /> : null}
            {failed ? (
              <View style={styles.error} accessibilityRole="alert">
                <SymbolView name="exclamationmark.triangle" size={17} tintColor={colors.danger} weight="regular" />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" color={colors.danger}>
                    Export failed
                  </AppText>
                  <AppText variant="label" color={colors.textSecondary}>
                    {project.error}
                  </AppText>
                </View>
              </View>
            ) : null}

            {watermark ? (
              <Pressable
                onPress={() => seePlans('watermark')}
                accessibilityRole="button"
                accessibilityHint="Shows plans"
                style={styles.notice}>
                <AppText variant="caption" color={colors.textMuted}>
                  Free exports include a small Tenfold watermark
                  {Number.isFinite(left) ? (
                    <AppText variant="caption" color={colors.textMuted} tabular>
                      {` · ${left} left this month`}
                    </AppText>
                  ) : null}
                  .{' '}
                  <AppText variant="caption" color={colors.textPrimary}>
                    Remove it with {TIER_NAMES[cleanTier]}
                  </AppText>
                </AppText>
              </Pressable>
            ) : Number.isFinite(left) ? (
              <AppText variant="caption" color={colors.textMuted} style={styles.notice} tabular>
                {left} exports left this month
              </AppText>
            ) : null}
          </View>
        ) : finished ? (
          <View style={styles.status}>
            <Thumb seed={seedOf(project.id)} uri={project.posterUri} style={styles.posterLarge}>
              <GlassSurface variant="clear" pointerEvents="none" style={styles.doneMark}>
                <SymbolView name={saved ? 'checkmark' : 'square.and.arrow.up'} size={20} tintColor={colors.textPrimary} weight="semibold" />
              </GlassSurface>
            </Thumb>
            <AppText variant="label" color={colors.textSecondary} style={styles.center}>
              {saved ? 'In your camera roll' : 'Share it to save or post'}
            </AppText>
            {project.error ? (
              <AppText variant="label" color={colors.orange} style={styles.center}>
                {project.error}
              </AppText>
            ) : null}
          </View>
        ) : (
          <View style={styles.status}>
            <Thumb seed={seedOf(project.id)} uri={project.posterUri} style={styles.posterLarge}>
              <View style={[StyleSheet.absoluteFill, styles.dim]}>
                <View style={styles.ring}>
                  <ProgressRing progress={project.progress} size={RING} showLabel={false} />
                  <View style={[StyleSheet.absoluteFill, styles.ringLabel]} accessibilityElementsHidden>
                    <AppText variant="title" tabular>
                      {percent}%
                    </AppText>
                  </View>
                </View>
              </View>
            </Thumb>
            <AppText variant="bodyStrong" style={styles.center}>
              {stage}
            </AppText>
            <AppText variant="label" color={colors.textMuted} style={styles.center}>
              Keeps running if you close this
            </AppText>
          </View>
        )}
      </View>

      {choosing && (
        <GradientButton
          title={left <= 0 ? 'See plans' : 'Save to Photos'}
          icon={left <= 0 ? false : 'square.and.arrow.down'}
          shape="pill"
          onPress={start}
        />
      )}
      {/* While exporting, the header's Close is the way out (the export keeps running). */}
      {saved && (
        <View style={styles.actions}>
          <GradientButton title="Open TikTok" icon="arrow.up.right" shape="pill" onPress={openTikTok} />
          <View style={styles.actionRow}>
            <OutlineButton title="Share" icon="square.and.arrow.up" height={50} style={styles.flex} onPress={share} />
            <OutlineButton title="Done" height={50} style={styles.flex} onPress={() => router.back()} />
          </View>
        </View>
      )}
      {/* Not in Photos (access denied or save failed): Share is the way to get the video out. */}
      {finished && !saved && (
        <View style={styles.actions}>
          <GradientButton title="Share video" icon="square.and.arrow.up" shape="pill" onPress={share} />
          <OutlineButton title="Done" height={50} onPress={() => router.back()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.md },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  subtitle: { marginTop: -spacing.sm, paddingHorizontal: spacing.xxl },
  middle: { flex: 1, justifyContent: 'center' },

  choose: { gap: spacing.sm },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: colors.dangerSoft,
  },
  notice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },

  status: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  ring: { width: RING, height: RING },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  dim: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  poster: { alignSelf: 'center', width: 132, aspectRatio: 9 / 16, borderRadius: radii.card, marginBottom: spacing.lg },
  posterLarge: { width: 170, aspectRatio: 9 / 16, borderRadius: radii.card, marginBottom: spacing.sm },
  doneMark: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actions: { gap: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.md },
});
