import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { importNewBatch, useImporting } from '@/batch/importClips';
import { AppText, Background, Card, GradientButton, IconButton, ProgressBar, Thumb } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, motion, radii, spacing } from '@/design/tokens';
import { EngineEvents, engineAvailable } from '@/engine';
import { maxBatchSize, tierOf, useEntitlements } from '@/state/entitlements';

const FACTS: { icon: SFSymbol; text: string }[] = [
  { icon: 'doc.on.doc', text: 'Clips are copied into Tenfold. Your originals in Photos stay untouched.' },
  { icon: 'iphone', text: 'Editing happens on this iPhone. Nothing is uploaded.' },
  { icon: 'icloud.and.arrow.down', text: 'Clips stored in iCloud download first, which can take a minute.' },
];

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const isPro = useEntitlements((s) => s.isPro);
  const limit = maxBatchSize(useEntitlements((s) => tierOf(s)));
  const busy = useImporting((s) => s.busy);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const available = engineAvailable();

  useEffect(() => {
    const sub = EngineEvents.onImportProgress(setProgress);
    return () => sub.remove();
  }, []);

  const pick = async () => {
    const batchId = await importNewBatch();
    setProgress(null);
    if (batchId) {
      router.dismiss();
      router.push({ pathname: '/batch/setup', params: { batchId } });
    }
  };

  const copying = busy && progress && progress.total > 0 ? progress : null;
  const current = copying ? Math.min(copying.index + 1, copying.total) : 0;
  const buttonTitle = !available
    ? 'Choose from Photos'
    : copying
      ? `Copying ${current} of ${copying.total}`
      : busy
        ? 'Waiting for Photos'
        : 'Choose from Photos';

  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom + spacing.lg }]}>
      <Background />
      <View style={styles.top}>
        <View style={styles.grabber} />
        <IconButton icon="xmark" label="Close" onPress={() => router.back()} disabled={busy} />
      </View>

      <View style={styles.center}>
        <View style={styles.stack} accessible={false} importantForAccessibility="no-hide-descendants">
          {[2, 1, 0].map((i) => (
            <View
              key={i}
              style={[styles.stackCard, { transform: [{ rotate: `${(i - 1) * 6}deg` }, { translateX: (i - 1) * 30 }] }]}>
              <Thumb seed={i + 4} style={styles.stackThumb} />
            </View>
          ))}
        </View>
        <AppText variant="display" accessibilityRole="header" style={styles.text}>
          Pick your clips
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.text}>
          Choose up to {limit} videos of someone talking to camera. You can add more to the batch later.
        </AppText>

        {copying ? (
          <Animated.View entering={FadeIn.duration(motion.fast)}>
            <Card style={styles.card}>
              <View style={styles.progressHead}>
                <AppText variant="bodyStrong" tabular style={styles.flex}>
                  Copying clip {current} of {copying.total}
                </AppText>
              </View>
              <View
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Copying clips"
                accessibilityValue={{ min: 0, max: copying.total, now: copying.index }}>
                <ProgressBar progress={copying.index / copying.total} height={4} />
              </View>
              <AppText variant="label" color={colors.textSecondary}>
                Keep this screen open. Clips in iCloud download first.
              </AppText>
            </Card>
          </Animated.View>
        ) : (
          <Card style={styles.card}>
            {FACTS.map((f) => (
              <View key={f.text} style={styles.factRow}>
                <SymbolView name={f.icon} size={17} tintColor={colors.textSecondary} weight="regular" style={styles.factIcon} />
                <AppText variant="label" color={colors.textSecondary} style={styles.flex}>
                  {f.text}
                </AppText>
              </View>
            ))}
          </Card>
        )}
      </View>

      <View style={styles.footer}>
        <GradientButton
          title={buttonTitle}
          icon={busy ? false : 'photo.on.rectangle'}
          disabled={busy || !available}
          onPress={pick}
        />
        {!available ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.text}>
            This build doesn’t include the video engine. Install the latest build to import clips.
          </AppText>
        ) : !isPro ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.text} tabular>
            Free: {maxBatchSize(false)} clips per batch. Pro: {maxBatchSize(true)}.
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.md },
  grabber: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -18,
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.gutter, gap: spacing.md },
  stack: { height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  stackCard: { position: 'absolute' },
  stackThumb: {
    width: 96,
    height: 164,
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  text: { textAlign: 'center' },
  card: { gap: spacing.md, marginTop: spacing.lg },
  progressHead: { flexDirection: 'row', alignItems: 'center' },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  factIcon: { width: 22, height: 20 },
  footer: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
});
