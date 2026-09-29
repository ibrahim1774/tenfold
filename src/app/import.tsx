import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { importJoinedBatch, importNewBatch, useImporting } from '@/batch/importClips';
import {
  AppText,
  Background,
  Chip,
  ChipGroup,
  GradientButton,
  IconButton,
  ProgressBar,
  ScreenHeader,
  Thumb,
} from '@/design/components';
import { sampleFrame } from '@/design/sampleFrames';
import { light, motion, radii, shadows, spacing } from '@/design/tokens';
import { Engine, EngineEvents, engineAvailable } from '@/engine';
import { maxBatchSize, tierOf, useEntitlements } from '@/state/entitlements';

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  // Single clip: each picked video becomes its own video in the batch. Multiple clips: the picked videos
  // are joined, in the order picked, into one video (more clips can be added in the editor).
  const params = useLocalSearchParams<{ mode?: string }>();
  const canJoin = Engine.canAddClips();
  const [mode, setMode] = useState<'single' | 'multiple'>(params.mode === 'multiple' && canJoin ? 'multiple' : 'single');
  const tier = useEntitlements((s) => tierOf(s));
  const limit = maxBatchSize(tier);
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
        <ScreenHeader left={<IconButton icon="xmark" label="Close" onPress={() => router.back()} disabled={busy} />} />
      </View>

      <View style={styles.center}>
        <View style={styles.stack} accessible={false} importantForAccessibility="no-hide-descendants">
          {[2, 1, 0].map((i) => (
            <View
              key={i}
              style={[styles.stackCard, { transform: [{ rotate: `${(i - 1) * 7}deg` }, { translateX: (i - 1) * 44 }, { translateY: Math.abs(i - 1) * 10 }] }]}>
              <Thumb seed={i + 4} source={sampleFrame(i + 1)} style={styles.stackThumb} />
            </View>
          ))}
        </View>
        <AppText variant="display" accessibilityRole="header" style={styles.text}>
          Pick your clips
        </AppText>
        <AppText variant="body" color={light.textSecondary} style={styles.text}>
          {mode === 'multiple' ? `Up to ${limit} clips, joined in the order you pick.` : `Up to ${limit} clips. Originals stay in Photos.`}
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
          <Animated.View entering={FadeIn.duration(motion.fast)} style={styles.copying}>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Copying clips"
              accessibilityValue={{ min: 0, max: copying.total, now: copying.index }}>
              <ProgressBar progress={copying.index / copying.total} height={3} />
            </View>
            <AppText variant="label" color={light.textSecondary} style={styles.text}>
              Keep this open. iCloud clips download first.
            </AppText>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <GradientButton
          title={buttonTitle}
          icon={busy ? false : 'photo.on.rectangle'}
          disabled={busy || !available}
          onPress={pick}
        />
        {!available ? (
          <AppText variant="caption" color={light.textMuted} style={styles.text}>
            This build has no video engine. Install the latest build.
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Clears the grabber; the Close glass circle sits in the leading corner like an iOS 26 sheet.
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  grabber: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -18,
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: light.borderStrong,
  },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.gutter, gap: spacing.md },
  stack: { height: 250, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  // Each card lifts on the soft shadow (on this view); the thumbnail inside clips to the same corners.
  stackCard: { position: 'absolute', borderRadius: radii.card, borderCurve: 'continuous', backgroundColor: light.card, ...shadows.soft },
  stackThumb: {
    width: 124,
    height: 220,
    borderRadius: radii.card,
    borderCurve: 'continuous',
  },
  text: { textAlign: 'center' },
  copying: { gap: spacing.sm, marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
  modes: { alignItems: 'center' },
});
