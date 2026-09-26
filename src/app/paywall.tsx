import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, FeatureRow, GradientButton, IconButton, PressableScale, SegmentedPill } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { useEntitlements } from '@/state/entitlements';
import { useSettings } from '@/state/settings';

type Plan = 'monthly' | 'yearly';

// M5: products, prices and trial eligibility come from Superwall. These strings are
// placeholders replaced by the store's localized price strings; never ship them hardcoded.
const MOCK_OFFERING: Record<Plan, { price: string; period: string; note: string }> = {
  monthly: { price: '$9.99', period: '/month', note: 'Billed monthly. Cancel anytime.' },
  yearly: { price: '$49.99', period: '/year', note: '7 days free, then billed annually. Cancel anytime.' },
};

const FEATURES = [
  { icon: 'infinity', title: 'Unlimited exports', subtitle: 'No credits, no minutes, ever.', color: '#FF7A30' },
  { icon: 'square.stack.3d.up', title: 'Batches of 20', subtitle: 'Free plan edits 5 at a time.', color: '#A98BFF' },
  { icon: 'drop.degreesign.slash', title: 'No watermark', subtitle: 'Clean videos, ready for social.', color: '#FF6A8A' },
  { icon: '4k.tv', title: '4K export', subtitle: 'Full resolution from your camera.', color: '#4DD8FF' },
  { icon: 'captions.bubble', title: 'All caption styles', subtitle: 'Karaoke, Outline, Subtle and more.', color: '#FFC24D' },
] as const;

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [plan, setPlan] = useState<Plan>('yearly');
  const setPro = useEntitlements((s) => s.setPro);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const offer = MOCK_OFFERING[plan];
  const fromOnboarding = from === 'onboarding';

  const close = () => {
    if (fromOnboarding) {
      setOnboarded(true);
      router.replace('/');
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <IconButton icon="xmark" label={fromOnboarding ? 'Continue with free plan' : 'Close'} size={40} onPress={close} />
        </View>

        <Animated.View entering={FadeInDown.duration(400)} style={styles.head}>
          <AppText variant="label" color={colors.textSecondary} style={styles.center}>
            Tenfold Pro
          </AppText>
          <AppText variant="hero" style={styles.center}>
            Edit Without Limits
          </AppText>
          <AppText variant="label" color={colors.textSecondary} style={styles.center}>
            Batch edit unlimited videos on your iPhone. No credits. No uploads.
          </AppText>
        </Animated.View>

        <SegmentedPill<Plan>
          value={plan}
          onChange={setPlan}
          segments={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly', badge: '-58%' },
          ]}
        />

        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <Animated.View key={f.title} entering={FadeInDown.delay(60 * i).duration(350)}>
              <FeatureRow icon={f.icon} title={f.title} subtitle={f.subtitle} iconColor={f.color} />
            </Animated.View>
          ))}
        </View>

        <View style={styles.priceBlock}>
          <AppText style={styles.price}>
            {offer.price}
            <AppText variant="bodyStrong">{offer.period}</AppText>
          </AppText>
          <AppText variant="label" color={colors.textSecondary} style={styles.center}>
            {offer.note}
          </AppText>
        </View>

        <GradientButton
          title={plan === 'yearly' ? 'Start 7-day free trial' : 'Subscribe'}
          icon={false}
          shape="pill"
          onPress={() => {
            setPro(true);
            close();
          }}
        />

        {fromOnboarding && (
          <PressableScale haptic={false} onPress={close} style={styles.later} accessibilityRole="button">
            <AppText variant="bodyStrong" color={colors.textSecondary}>
              Continue with free plan
            </AppText>
          </PressableScale>
        )}

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
  content: { paddingHorizontal: spacing.gutter, gap: spacing.lg },
  top: { flexDirection: 'row' },
  head: { gap: spacing.sm },
  center: { textAlign: 'center' },
  features: { gap: 10 },
  priceBlock: { gap: 2, marginTop: spacing.sm },
  price: { fontFamily: 'Poppins-SemiBold', fontSize: 40, lineHeight: 48, color: '#FFFFFF', textAlign: 'center', letterSpacing: -1 },
  later: { alignSelf: 'center', padding: 8 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
});
