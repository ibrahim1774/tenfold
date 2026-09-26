import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queueExports, STAGE_LABELS } from '@/batch/queue';
import { AppText, Background, Card, Chip, ChipGroup, GradientButton, OutlineButton, PressableScale, ProgressRing } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { exportsLeft, useEntitlements } from '@/state/entitlements';
import { useLibrary } from '@/state/library';
import { useSettings } from '@/state/settings';

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = useLibrary((s) => s.projects[projectId]);
  const ent = useEntitlements();
  const { exportQuality, setExportQuality } = useSettings();
  // When this screen started an export (0 = not yet), to tell a fresh export from an older one.
  const [startedAt, setStartedAt] = useState(0);
  const started = startedAt > 0;

  const busy = project?.status === 'exportQueued' || project?.status === 'exporting';
  const finished = started && project?.status === 'done' && (project.exportedAt ?? 0) >= startedAt;
  const failed = started && !busy && !finished && !!project?.error;
  const can4K = (project?.media ? Math.min(project.media.width, project.media.height) : 0) >= 2160;

  useEffect(() => {
    if (failed && project?.error) Alert.alert('Export failed', project.error);
  }, [failed, project?.error]);

  if (!project) return null;

  const start = () => {
    if (exportsLeft(ent) <= 0) {
      router.push('/paywall');
      return;
    }
    setStartedAt(Date.now());
    queueExports([projectId]);
  };

  const share = async () => {
    if (!project.exportUri) return;
    if (!(await Sharing.isAvailableAsync())) return;
    await Sharing.shareAsync(project.exportUri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
  };

  const openTikTok = async () => {
    const can = await Linking.canOpenURL('tiktok://').catch(() => false);
    await Linking.openURL(can ? 'tiktok://' : 'photos-redirect://');
  };

  const left = exportsLeft(ent);

  return (
    <View style={[styles.flex, { paddingTop: spacing.xxl, paddingBottom: insets.bottom + 16 }]}>
      <Background />
      <AppText variant="title" style={styles.center}>
        {finished ? (project.savedToPhotos ? 'Saved to Photos' : 'Exported') : 'Export'}
      </AppText>
      <AppText variant="body" color={colors.textSecondary} style={styles.center} numberOfLines={1}>
        {project.title}
      </AppText>

      <View style={styles.middle}>
        {!started || failed ? (
          <Card style={styles.options}>
            <AppText variant="bodyStrong">Quality</AppText>
            <ChipGroup>
              <Chip label="1080p" selected={exportQuality === 'hd' || !ent.isPro} onPress={() => setExportQuality('hd')} />
              <Chip
                label="4K"
                locked={!ent.isPro}
                disabled={ent.isPro && !can4K}
                selected={ent.isPro && exportQuality === 'uhd'}
                onPress={() => (ent.isPro ? setExportQuality('uhd') : router.push('/paywall'))}
              />
            </ChipGroup>
            {ent.isPro && !can4K && (
              <AppText variant="caption" color={colors.textMuted}>
                4K needs a 4K source clip.
              </AppText>
            )}
            {!ent.isPro && (
              <PressableScale onPress={() => router.push('/paywall')} style={styles.notice}>
                <SymbolView name="info.circle" size={18} tintColor={colors.textPrimary} />
                <AppText variant="caption" style={styles.flexText}>
                  Free exports include a small Tenfold watermark · {Number.isFinite(left) ? `${left} left this month` : ''}. Go Pro to remove it.
                </AppText>
              </PressableScale>
            )}
          </Card>
        ) : (
          <View style={styles.ring}>
            <ProgressRing
              progress={finished ? 1 : project.progress}
              size={180}
              label={finished ? 'Done' : undefined}
            />
            {!finished && (
              <AppText variant="label" color={colors.textSecondary}>
                {project.status === 'exportQueued' ? 'Waiting for the current export…' : (STAGE_LABELS[project.stage ?? ''] ?? 'Exporting')}
              </AppText>
            )}
            {finished && project.error ? (
              <AppText variant="label" color={colors.orange} style={styles.center}>
                {project.error}
              </AppText>
            ) : null}
          </View>
        )}
      </View>

      {(!started || failed) && (
        <GradientButton title="Save to Photos" icon="square.and.arrow.down" shape="pill" onPress={start} />
      )}
      {started && busy && <OutlineButton title="Hide" height={50} onPress={() => router.back()} />}
      {finished && (
        <View style={styles.saved}>
          <GradientButton title="Open TikTok" icon="arrow.up.right" shape="pill" onPress={openTikTok} />
          <View style={styles.savedRow}>
            <OutlineButton title="Share" icon="square.and.arrow.up" height={50} style={styles.flexOne} onPress={share} />
            <OutlineButton title="Done" height={50} style={styles.flexOne} onPress={() => router.back()} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingHorizontal: spacing.gutter, gap: 4 },
  center: { textAlign: 'center' },
  flexOne: { flex: 1 },
  middle: { flex: 1, justifyContent: 'center' },
  options: { gap: spacing.md },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: spacing.sm },
  flexText: { flex: 1 },
  ring: { alignItems: 'center', gap: spacing.md },
  saved: { gap: spacing.md },
  savedRow: { flexDirection: 'row', gap: spacing.md },
});
