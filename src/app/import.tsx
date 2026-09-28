import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { importJoinedBatch, importNewBatch, useImporting } from '@/batch/importClips';
import { AppText, Background, Card, Chip, ChipGroup, GradientButton, IconButton, ProgressBar, Thumb } from '@/design/components';
import { sampleFrame } from '@/design/sampleFrames';
import type { SFSymbol } from '@/design/symbols';
import { colors, motion, radii, spacing } from '@/design/tokens';
import { Engine, EngineEvents, engineAvailable } from '@/engine';
import { nextTier } from '@/onboarding/plans';
import { maxBatchSize, tierOf, TIER_NAMES, useEntitlements } from '@/state/entitlements';

const FACTS: { icon: SFSymbol; text: string }[] = [
  { icon: 'doc.on.doc', text: 'Clips are copied into Tenfold. Your originals in Photos stay untouched.' },
  { icon: 'iphone', text: 'Editing happens on this iPhone. Nothing is uploaded.' },
  { icon: 'icloud.and.arrow.down', text: 'Clips stored in iCloud download first, which can take a minute.' },
];

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  // Single clip: each picked video becomes its own video in the batch. Multiple clips: the picked videos
  // are joined, in the order picked, into one video (more clips can be added in the editor).
  const params = useLocalSearchParams<{ mode?: string }>();
  const canJoin = Engine.canAddClips();
  const [mode, setMode] = useState<'single' | 'multiple'>(params.mode === 'multiple' && canJoin ? 'multiple' : 'single');
  const tier = useEntitlements((s) => tierOf(s));
  const limit = maxBatchSize(tier);
  const bigger = nextTier(tier);
  const busy = useImporting((s) => s.busy);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const available = engineAvailable();

  useEffect(() => {
    const sub = EngineEvents.onImportProgress(setProgress);
    return () => sub.remove();
  }, []);

  const pick = async () => {
    const batchId = mode === 'multiple' ? await importJoinedBatch() : await importNewBatch();
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
              <Thumb seed={i + 4} source={sampleFrame(i + 1)} style={styles.stackThumb} />
            </View>
          ))}
        </View>
        <AppText variant="display" accessibilityRole="header" style={styles.text}>
          Pick your clips
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.text}>
          {mode === 'multiple'
            ? `Choose up to ${limit} clips. They play one after another in the order you pick them, as one video.`
            : `Choose up to ${limit} videos of someone talking to camera. You can add more to the batch later.`}
        </AppText>
        {canJoin && !busy && (
          <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="Each video is">
            <ChipGroup>
              <Chip label="Single clip" selected={mode === 'single'} onPress={() => setMode('single')} />
              <Chip label="Multiple clips" selected={mode === 'multiple'} onPress={() => setMode('multiple')} />
            </ChipGroup>
          </View>
        )}

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
        ) : bigger ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.text} tabular>
            {TIER_NAMES[tier]}: {limit} clips per batch. {TIER_NAMES[bigger]}: {maxBatchSize(bigger)}.
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
  modes: { alignItems: 'center' },
});
