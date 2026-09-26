import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, FeatureRow, GradientButton, IconButton, PressableScale, SegmentedPill } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { useEntitlements } from '@/state/entitlements';

type Plan = 'monthly' | 'yearly';

// M5: offerings, prices and trial eligibility come from RevenueCat. The strings below are
// placeholders that get replaced by the store's localized price strings; never ship them hardcoded.
const MOCK_OFFERING: Record<Plan, { price: string; period: string; note: string }> = {
  monthly: { price: '$9.99', period: '/month', note: 'Billed monthly. Cancel anytime.' },
  yearly: { price: '$49.99', period: '/year', note: 'Billed annually. Cancel anytime.' },
};

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<Plan>('yearly');
  const setPro = useEntitlements((s) => s.setPro);
  const offer = MOCK_OFFERING[plan];

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.top}>
          <IconButton icon="xmark" label="Close" onPress={() => router.back()} />
        </View>

        <AppText variant="bodyStrong" color={colors.textOnLightMuted} style={styles.center}>
          Get Tenfold Pro
        </AppText>
        <AppText variant="display" style={[styles.center, styles.title]}>
          Edit Without Limits
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} style={styles.center}>
          Batch edit unlimited videos on your iPhone. No credits. No uploads.
        </AppText>

        <SegmentedPill<Plan>
          value={plan}
          onChange={setPlan}
          segments={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly', badge: 'Save 58%' },
          ]}
        />

        <View style={styles.features}>
          <FeatureRow icon="infinity" title="Unlimited exports" subtitle="No credits, ever." />
          <FeatureRow icon="square.stack.3d.up.fill" title="Batches of 20" subtitle="Free plan is limited to 5." iconColor="#B07CFF" />
          <FeatureRow icon="drop.degreesign.slash" title="No watermark" subtitle="Clean videos, ready for social." iconColor="#FF7A59" />
          <FeatureRow icon="4k.tv" title="4K export" subtitle="Ultra-high-definition video quality." iconColor="#4DD8FF" />
          <FeatureRow icon="captions.bubble.fill" title="All caption styles" subtitle="Karaoke, Outline, Subtle and more." iconColor="#FFC24D" />
        </View>

        <View style={styles.priceCard}>
          <AppText variant="display" style={styles.center}>
            {offer.price}
            <AppText variant="bodyStrong">{offer.period}</AppText>
          </AppText>
          <AppText variant="caption" color={colors.textSecondary} style={styles.center}>
            {offer.note}
          </AppText>
          <GradientButton
            title="Start 7-day free trial"
            icon={false}
            onPress={() => {
              setPro(true);
              router.back();
            }}
          />
        </View>

        <View style={styles.links}>
          {['Restore', 'Terms', 'Privacy'].map((l) => (
            <PressableScale key={l} haptic={false} accessibilityRole="link">
              <AppText variant="caption" color={colors.textMuted}>
                {l}
              </AppText>
            </PressableScale>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.md },
  top: { flexDirection: 'row' },
  center: { textAlign: 'center' },
  title: { color: colors.textPrimary, textShadowColor: 'rgba(15,18,34,0.35)', textShadowRadius: 12 },
  features: { gap: 10, marginTop: spacing.sm },
  priceCard: {
    marginTop: spacing.sm,
    padding: spacing.xl,
    gap: spacing.sm,
    borderRadius: 32,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(22,26,48,0.8)',
  },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingTop: spacing.sm },
});
