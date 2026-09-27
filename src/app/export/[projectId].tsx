import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queueExports, STAGE_LABELS } from '@/batch/queue';
import { AppText, Background, GradientButton, OutlineButton, ProgressRing } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { usePaywallGate } from '@/monetization/superwall';
import { limitsFor, lowestTierWhere } from '@/onboarding/plans';
import { exportsLeft, tierOf, TIER_NAMES, useEntitlements } from '@/state/entitlements';
import { useLibrary } from '@/state/library';
import { useSettings } from '@/state/settings';

const RING = 176;

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = useLibrary((s) => s.projects[projectId]);
  const ent = useEntitlements();
  const tier = tierOf(ent);
  const { uhd: uhdAllowed, watermark } = limitsFor(tier);
  const gate = usePaywallGate();
  const { exportQuality, setExportQuality } = useSettings();
  // When this screen started an export (0 = not yet), to tell a fresh export from an older one.
  const [startedAt, setStartedAt] = useState(0);
  const busy = project?.status === 'exportQueued' || project?.status === 'exporting';
  // Also "started" when coming back to an export that's already running.
  const started = startedAt > 0 || busy;
  const finished = started && project?.status === 'done' && (project.exportedAt ?? 0) >= startedAt;
  const failed = started && !busy && !finished && !!project?.error;
  const can4K = (project?.media ? Math.min(project.media.width, project.media.height) : 0) >= 2160;

  // One success tick when the export lands, never again for this screen.
  const celebrated = useRef(false);
  useEffect(() => {
    if (finished && !celebrated.current) {
      celebrated.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [finished]);

  if (!project) return null;

  const left = exportsLeft(ent);
  const choosing = !started || failed;
  const saved = finished && !!project.savedToPhotos;
  const uhdSelected = uhdAllowed && can4K && exportQuality === 'uhd';
  const uhdTier = lowestTierWhere((l) => l.uhd) ?? 'pro';
  const cleanTier = lowestTierWhere((l) => !l.watermark) ?? 'starter';

  const exportNow = () => {
    setStartedAt(Date.now());
    queueExports([projectId]);
  };
  const start = () => {
    if (exportsLeft(ent) > 0) {
      exportNow();
      return;
    }
    // Out of exports this month: gated, the export starts once the plan allows it.
    gate({
      placement: 'export_limit',
      params: { tier },
      allowed: () => exportsLeft(useEntitlements.getState()) > 0,
      run: exportNow,
    });
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

  const pickQuality = (q: 'hd' | 'uhd') => {
    if (q === 'uhd' && !uhdAllowed) {
      // No placement of its own: the plans paywall, then 4K is selected once the plan includes it.
      gate({
        placement: 'settings_upgrade',
        params: { feature: '4k' },
        allowed: () => limitsFor(tierOf(useEntitlements.getState())).uhd,
        run: () => setExportQuality('uhd'),
      });
      return;
    }
    if (q === exportQuality) return;
    Haptics.selectionAsync();
    setExportQuality(q);
  };

  const title = choosing ? 'Export' : finished ? (saved ? 'Saved to Photos' : 'Not saved to Photos') : 'Exporting';
  const percent = Math.round(Math.max(0, Math.min(1, project.progress)) * 100);
  const stage =
    project.status === 'exportQueued' ? 'Waiting for the current export to finish' : (STAGE_LABELS[project.stage ?? ''] ?? 'Exporting');

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + spacing.lg }]}>
      <Background />
      <View style={styles.header}>
        <AppText variant="title" style={styles.center} accessibilityRole="header">
          {title}
        </AppText>
        <AppText variant="label" color={colors.textSecondary} style={styles.center} numberOfLines={1}>
          {project.title}
        </AppText>
      </View>

      <View style={styles.middle}>
        {choosing ? (
          <View style={styles.choose}>
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

            <AppText variant="caption" color={colors.textMuted} style={styles.groupTitle}>
              QUALITY
            </AppText>
            <View style={styles.group}>
              <QualityRow
                title="1080p"
                subtitle="Full HD"
                selected={!uhdSelected}
                onPress={() => pickQuality('hd')}
              />
              <QualityRow
                title="4K"
                subtitle={uhdAllowed && !can4K ? 'Needs a 4K source clip' : 'Sharper on large screens, bigger file'}
                selected={uhdSelected}
                badge={uhdAllowed ? undefined : TIER_NAMES[uhdTier]}
                disabled={uhdAllowed && !can4K}
                onPress={() => pickQuality('uhd')}
                last
              />
            </View>

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
            <View style={[styles.doneMark, !saved && styles.doneMarkMuted]}>
              <SymbolView
                name={saved ? 'checkmark' : 'square.and.arrow.up'}
                size={34}
                tintColor={saved ? colors.success : colors.textPrimary}
                weight="regular"
              />
            </View>
            <AppText variant="body" color={colors.textSecondary} style={styles.center}>
              {saved ? 'Ready to post from your camera roll.' : 'Share the video to save it or post it.'}
            </AppText>
            {project.error ? (
              <AppText variant="label" color={colors.orange} style={styles.center}>
                {project.error}
              </AppText>
            ) : null}
          </View>
        ) : (
          <View style={styles.status}>
            <View style={styles.ring}>
              <ProgressRing progress={project.progress} size={RING} showLabel={false} />
              <View style={[StyleSheet.absoluteFill, styles.ringLabel]} accessibilityElementsHidden>
                <AppText variant="display" tabular>
                  {percent}%
                </AppText>
              </View>
            </View>
            <AppText variant="bodyStrong" style={styles.center}>
              {stage}
            </AppText>
            <AppText variant="label" color={colors.textMuted} style={styles.center}>
              You can close this. The export keeps running.
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
      {!choosing && !finished && <OutlineButton title="Close" height={50} onPress={() => router.back()} />}
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

type QualityRowProps = {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  /** The plan that unlocks this row, shown as a badge. */
  badge?: string;
  disabled?: boolean;
  last?: boolean;
};

function QualityRow({ title, subtitle, selected, onPress, badge, disabled, last }: QualityRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={badge ? `${title}, ${badge}` : title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: selected, disabled }}>
      {({ pressed }) => (
        <View style={[styles.row, pressed && styles.rowPressed, disabled && styles.rowDisabled]}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{title}</AppText>
            <AppText variant="label" color={colors.textMuted}>
              {subtitle}
            </AppText>
          </View>
          {badge ? (
            <View style={styles.proBadge}>
              <AppText variant="caption" color={colors.textSecondary}>
                {badge}
              </AppText>
            </View>
          ) : null}
          {selected ? <SymbolView name="checkmark" size={16} tintColor={colors.textPrimary} weight="regular" /> : null}
          {!last ? <View style={styles.divider} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.xxl, gap: spacing.md },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  header: { gap: 2, paddingHorizontal: spacing.xl },
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
  groupTitle: { letterSpacing: 0.6, paddingHorizontal: spacing.lg },
  group: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12, minHeight: 60 },
  rowPressed: { backgroundColor: colors.cardHigh },
  rowDisabled: { opacity: 0.45 },
  divider: {
    position: 'absolute',
    left: spacing.lg,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  proBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.round,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  notice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },

  status: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  ring: { width: RING, height: RING, marginBottom: spacing.sm },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  doneMark: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74,222,128,0.12)',
    marginBottom: spacing.sm,
  },
  doneMarkMuted: { backgroundColor: colors.cardHigh },

  actions: { gap: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.md },
});
