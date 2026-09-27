import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, GradientButton, IconButton } from '@/design/components';
import { colors, motion, radii, spacing } from '@/design/tokens';
import {
  annualSavingPercent,
  PLANS,
  perMonth,
  planFor,
  priceLine,
  renewalLine,
  TRIAL_DAYS,
  type Billing,
  type PlanInfo,
} from '@/onboarding/plans';
import { tierOf, useEntitlements, type Tier } from '@/state/entitlements';
import { useSettings } from '@/state/settings';

const NOT_YET = 'Purchases arrive with the App Store release.';

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const current = useEntitlements((s) => tierOf(s));
  const setTier = useEntitlements((s) => s.setTier);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const [billing, setBilling] = useState<Billing>('annual');
  const [tier, setSelected] = useState<Tier>(current === 'free' ? 'pro' : current);
  const [notice, setNotice] = useState<string | null>(null);
  const fromOnboarding = from === 'onboarding';
  const plan = planFor(tier);
  const saving = annualSavingPercent(planFor('pro'));

  const close = () => {
    if (fromOnboarding) {
      setOnboarded(true);
      router.replace('/');
    } else {
      router.back();
    }
  };

  const pickBilling = (b: Billing) => {
    if (b === billing) return;
    Haptics.selectionAsync();
    setBilling(b);
  };
  const pickTier = (t: Tier) => {
    if (t === tier) return;
    Haptics.selectionAsync();
    setSelected(t);
    setNotice(null);
  };

  const confirm = () => {
    // TODO(M5): Superwall purchase. Until then dev builds switch tiers locally to test limits;
    // release builds never unlock anything for free.
    if (tier === 'free') {
      if (__DEV__) setTier('free');
      close();
      return;
    }
    if (__DEV__) {
      setTier(tier);
      close();
    } else {
      setNotice(NOT_YET);
    }
  };

  const links = [
    { label: 'Restore purchases', onPress: () => setNotice(NOT_YET) },
    // Apple's standard licence agreement until Tenfold has its own terms page.
    { label: 'Terms', onPress: () => WebBrowser.openBrowserAsync('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/') },
    {
      label: 'Privacy',
      onPress: () =>
        Alert.alert('Privacy', 'Tenfold edits everything on your iPhone. No account, no uploads, no analytics. Your videos never leave your phone.'),
    },
  ];

  return (
    <View style={[styles.flex, { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xs }]}>
      <Background />

      <View style={styles.top}>
        <IconButton icon="xmark" label={fromOnboarding ? 'Not now' : 'Close'} size={44} tone="ghost" onPress={close} />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <AppText variant="display" accessibilityRole="header">
            Try Tenfold Pro free for {TRIAL_DAYS} days
          </AppText>
          <AppText variant="body" color={colors.textSecondary}>
            Everything still runs on your iPhone. No account, no uploads.
          </AppText>
        </View>

        <View style={styles.segment} accessibilityRole="tablist">
          {(['monthly', 'annual'] as Billing[]).map((b) => {
            const on = billing === b;
            return (
              <Pressable
                key={b}
                onPress={() => pickBilling(b)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={b === 'annual' ? `Annual, save ${saving}%` : 'Monthly'}
                style={[styles.segmentItem, on && styles.segmentOn]}>
                <AppText variant="chip" color={on ? colors.textInverse : colors.textPrimary}>
                  {b === 'annual' ? 'Annual' : 'Monthly'}
                </AppText>
                {b === 'annual' && saving > 0 ? (
                  <View style={styles.savePill}>
                    <AppText variant="caption" color={colors.accentText} tabular>
                      Save {saving}%
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.plans} accessibilityRole="radiogroup">
          {PLANS.map((p) => (
            <PlanCard key={p.tier} plan={p} billing={billing} selected={tier === p.tier} current={current === p.tier} onPress={() => pickTier(p.tier)} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton title={`Continue with ${plan.name}`} shape="pill" onPress={confirm} />
        {notice ? (
          <Animated.View entering={FadeIn.duration(motion.fast)}>
            <AppText variant="caption" color={colors.textPrimary} style={styles.center} accessibilityLiveRegion="polite">
              {notice}
            </AppText>
          </Animated.View>
        ) : null}
        <AppText variant="caption" color={colors.textMuted} tabular style={styles.center}>
          {renewalLine(plan, billing)}
        </AppText>

        <Pressable onPress={close} accessibilityRole="button" style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
          <AppText variant="bodyStrong" color={colors.textSecondary}>
            Not now
          </AppText>
        </Pressable>

        <View style={styles.links}>
          {links.map(({ label, onPress }) => (
            <Pressable key={label} onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
              <AppText variant="caption" color={colors.textMuted}>
                {label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function PlanCard({
  plan,
  billing,
  selected,
  current,
  onPress,
}: {
  plan: PlanInfo;
  billing: Billing;
  selected: boolean;
  current: boolean;
  onPress: () => void;
}) {
  const price = priceLine(plan, billing);
  const detail = plan.price ? (billing === 'annual' ? perMonth(plan) : `${TRIAL_DAYS} days free`) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${plan.name}, ${price}${current ? ', your plan' : ''}. ${plan.features.join(', ')}`}
      style={({ pressed }) => [styles.plan, selected && styles.planOn, pressed && styles.pressed]}>
      <View style={styles.planHead}>
        <SymbolView
          name={selected ? 'checkmark.circle.fill' : 'circle'}
          size={22}
          tintColor={selected ? colors.textPrimary : colors.textMuted}
          weight="regular"
        />
        <View style={styles.flex}>
          <View style={styles.planName}>
            <AppText variant="bodyStrong">{plan.name}</AppText>
            {current ? (
              <AppText variant="caption" color={colors.textMuted}>
                Your plan
              </AppText>
            ) : null}
          </View>
          {detail ? (
            <AppText variant="label" color={colors.textSecondary} tabular>
              {detail}
            </AppText>
          ) : null}
        </View>
        <AppText variant="bodyStrong" tabular>
          {price}
        </AppText>
      </View>
      <View style={styles.features}>
        {plan.features.map((f) => (
          <View key={f} style={styles.feature}>
            <SymbolView name="checkmark" size={12} tintColor={colors.textSecondary} weight="regular" />
            <AppText variant="label" color={colors.textSecondary}>
              {f}
            </AppText>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.xl },
  head: { gap: spacing.sm },

  segment: { flexDirection: 'row', padding: 3, borderRadius: radii.button, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.button - 3,
  },
  segmentOn: { backgroundColor: colors.textPrimary },
  savePill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.round, backgroundColor: colors.bg },

  plans: { gap: spacing.md },
  plan: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  planOn: { borderColor: colors.textPrimary, backgroundColor: colors.cardHigh },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  planName: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  features: { paddingLeft: 22 + spacing.md, gap: 2 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.xs },
  textButton: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  pressed: { opacity: 0.6 },
});
