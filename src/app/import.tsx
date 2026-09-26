import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, GlassCard, GradientButton, ScreenHeader } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { maxBatchSize, useEntitlements } from '@/state/entitlements';
import { useBatchSetup } from '@/state/batchSetup';

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const isPro = useEntitlements((s) => s.isPro);
  const reset = useBatchSetup((s) => s.reset);
  const limit = maxBatchSize(isPro);

  // M1: TenfoldEngine.pickVideos(limit) presents PHPickerViewController. M0 uses mock clips.
  const pick = () => {
    reset();
    router.replace('/batch/setup');
  };

  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <Background />
      <ScreenHeader title="New batch" />
      <View style={styles.center}>
        <GlassCard style={styles.card}>
          <View style={styles.icon}>
            <SymbolView name="photo.stack.fill" size={48} tintColor={colors.textPrimary} />
          </View>
          <AppText variant="title" style={styles.text}>
            Pick your clips
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.text}>
            Choose up to {limit} talking-head videos from your camera roll. Tenfold only sees the clips you pick.
          </AppText>
          {!isPro && (
            <AppText variant="caption" color={colors.textMuted} style={styles.text}>
              Free: up to 5 per batch. Pro: up to 20.
            </AppText>
          )}
        </GlassCard>
      </View>
      <GradientButton title="Choose from Photos" icon={false} onPress={pick} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingHorizontal: spacing.gutter },
  center: { flex: 1, justifyContent: 'center' },
  card: { gap: spacing.md },
  icon: { alignItems: 'center', marginBottom: spacing.sm },
  text: { textAlign: 'center' },
});
