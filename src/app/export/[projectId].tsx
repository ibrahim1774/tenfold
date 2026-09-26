import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, Chip, ChipGroup, GradientButton, PressableScale, ProgressRing } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { mockProjects } from '@/mock/data';
import { useEntitlements } from '@/state/entitlements';

type Phase = 'options' | 'exporting' | 'saved';

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = mockProjects.find((p) => p.id === projectId) ?? mockProjects[0];
  const isPro = useEntitlements((s) => s.isPro);
  const [quality, setQuality] = useState<'1080p' | '4K'>('1080p');
  const [phase, setPhase] = useState<Phase>('options');
  const [progress, setProgress] = useState(0);

  // M0: simulated export. M3 calls TenfoldEngine.enqueueExport and listens to onJobProgress.
  useEffect(() => {
    if (phase !== 'exporting') return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          clearInterval(id);
          setPhase('saved');
          return 1;
        }
        return p + 0.05;
      });
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  const openTikTok = async () => {
    // Needs LSApplicationQueriesSchemes "tiktok" in M3; falls back to Photos.
    const can = await Linking.canOpenURL('tiktok://').catch(() => false);
    await Linking.openURL(can ? 'tiktok://' : 'photos-redirect://');
  };

  return (
    <View style={[styles.flex, { paddingTop: spacing.xxl, paddingBottom: insets.bottom + 16 }]}>
      <Background />
      <AppText variant="title" style={styles.center}>
        {phase === 'saved' ? 'Saved to Photos' : 'Export'}
      </AppText>
      <AppText variant="body" color={colors.textOnLightMuted} style={styles.center} numberOfLines={1}>
        {project.title}
      </AppText>

      <View style={styles.middle}>
        {phase === 'options' ? (
          <View style={styles.options}>
            <AppText variant="bodyStrong">Quality</AppText>
            <ChipGroup>
              <Chip label="1080p" selected={quality === '1080p'} onPress={() => setQuality('1080p')} />
              <Chip
                label="4K"
                locked={!isPro}
                selected={quality === '4K'}
                onPress={() => (isPro ? setQuality('4K') : router.push('/paywall'))}
              />
            </ChipGroup>
            {!isPro && (
              <PressableScale onPress={() => router.push('/paywall')} style={styles.notice}>
                <SymbolView name="info.circle" size={18} tintColor={colors.textPrimary} />
                <AppText variant="caption" style={styles.flexText}>
                  Free exports include a small Tenfold watermark. Go Pro to remove it.
                </AppText>
              </PressableScale>
            )}
          </View>
        ) : (
          <View style={styles.ring}>
            <ProgressRing progress={progress} size={180} label={phase === 'saved' ? 'Done' : undefined} />
          </View>
        )}
      </View>

      {phase === 'options' && <GradientButton title="Save to Photos" onPress={() => setPhase('exporting')} />}
      {phase === 'saved' && (
        <View style={styles.saved}>
          <GradientButton title="Open in TikTok" icon={false} onPress={openTikTok} />
          <View style={styles.savedRow}>
            <PressableScale style={styles.secondary} accessibilityRole="button">
              <AppText variant="bodyStrong">Share</AppText>
            </PressableScale>
            <PressableScale style={styles.secondary} accessibilityRole="button" onPress={() => router.back()}>
              <AppText variant="bodyStrong">Done</AppText>
            </PressableScale>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingHorizontal: spacing.gutter, gap: 4 },
  center: { textAlign: 'center', color: colors.textOnLight },
  middle: { flex: 1, justifyContent: 'center' },
  options: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: 28,
    backgroundColor: 'rgba(22,26,48,0.75)',
  },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: spacing.sm },
  flexText: { flex: 1 },
  ring: { alignItems: 'center' },
  saved: { gap: spacing.md },
  savedRow: { flexDirection: 'row', gap: spacing.md },
  secondary: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,26,48,0.75)',
  },
});
