import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, Card, GradientButton, IconButton, Thumb } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { useBatchSetup } from '@/state/batchSetup';
import { maxBatchSize, useEntitlements } from '@/state/entitlements';

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const isPro = useEntitlements((s) => s.isPro);
  const reset = useBatchSetup((s) => s.reset);
  const limit = maxBatchSize(isPro);

  // M1: TenfoldEngine.pickVideos(limit) presents PHPickerViewController. M0 uses mock clips.
  const pick = () => {
    reset();
    router.dismiss();
    router.push('/batch/setup');
  };

  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom + 16 }]}>
      <Background />
      <View style={styles.top}>
        <View style={styles.grabber} />
        <IconButton icon="xmark" label="Close" size={36} onPress={() => router.back()} />
      </View>

      <View style={styles.center}>
        <View style={styles.stack}>
          {[2, 1, 0].map((i) => (
            <Animated.View
              key={i}
              entering={FadeInDown.delay(80 * (2 - i)).springify()}
              style={[styles.stackCard, { transform: [{ rotate: `${(i - 1) * 8}deg` }, { translateX: (i - 1) * 34 }] }]}>
              <Thumb seed={i + 4} style={styles.stackThumb} />
            </Animated.View>
          ))}
        </View>
        <AppText variant="display" style={styles.text}>
          Pick your clips
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.text}>
          Choose up to {limit} talking videos. Tenfold only sees the clips you pick, and nothing is uploaded.
        </AppText>
        <Card style={styles.tips}>
          {[
            'Works best with one person talking to camera',
            'Up to 10 minutes per clip',
            'iCloud videos download first, so give them a moment',
          ].map((t) => (
            <View key={t} style={styles.tipRow}>
              <SymbolView name="checkmark" size={14} tintColor={colors.success} />
              <AppText variant="label" color={colors.textSecondary} style={styles.flex}>
                {t}
              </AppText>
            </View>
          ))}
        </Card>
      </View>
      <View style={styles.footer}>
        <GradientButton title="Choose from Photos" icon="photo.on.rectangle" shape="pill" onPress={pick} />
        {!isPro && (
          <AppText variant="caption" color={colors.textMuted} style={styles.text}>
            Free: 5 clips per batch. Pro: 20.
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.lg },
  grabber: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -18,
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.gutter, gap: spacing.md },
  stack: { height: 190, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  stackCard: { position: 'absolute' },
  stackThumb: { width: 100, height: 170, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  text: { textAlign: 'center' },
  tips: { gap: 10, marginTop: spacing.lg },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footer: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
});
