import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, GradientButton, IconButton } from '@/design/components';
import { colors, motion, radii, spacing } from '@/design/tokens';
import { useStoreActions } from '@/monetization/superwall';
import {
  annualSavingPill,
  PLANS,
  perMonth,
  planFor,
  priceLine,
  PRIVACY_URL,
  PRODUCT_IDS,
  renewalLine,
  TERMS_URL,
  TRIAL_DAYS,
  type Billing,
  type PaidTier,
  type PlanInfo,
} from '@/onboarding/plans';
import { tierOf, TIER_NAMES, useEntitlements } from '@/state/entitlements';
import { useSettings } from '@/state/settings';

// Tenfold's own paywall. Superwall presents the paywalls normally (src/monetization); this screen is the
// fallback when this build has no Superwall module or a paywall can't be presented.
export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const current = useEntitlements((s) => tierOf(s));
  const setTier = useEntitlements((s) => s.setTier);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const store = useStoreActions();
  const [billing, setBilling] = useState<Billing>('annual');
  const [tier, setSelected] = useState<PaidTier>(current === 'free' ? 'pro' : current);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fromOnboarding = from === 'onboarding';
  // Apple gives one free trial per subscription group: subscribers switching plans don't get another.
  const trial = current === 'free';
  const plan = planFor(tier);
  const saving = annualSavingPill();

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
  const pickTier = (t: PaidTier) => {
    if (t === tier) return;
    Haptics.selectionAsync();
    setSelected(t);
    setNotice(null);
  };

  // Development builds only: long-press a plan to switch to it locally (again to go back to Free).
  const devSetTier = __DEV__
    ? (t: PaidTier) => {
        const next = current === t ? 'free' : t;
        setTier(next);
        setNotice(`Development build: plan set to ${TIER_NAMES[next]} on this iPhone.`);
      }
    : undefined;

  const confirm = async () => {
    if (busy) return;
    if (tier === current) {
      close();
      return;
    }
    if (!store.available) {
      setNotice(store.unavailableReason);
      return;
    }
    setBusy(true);
    setNotice(null);
    const outcome = await store.purchase(PRODUCT_IDS[tier][billing]);
    setBusy(false);
    if (outcome === 'purchased') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      close();
    } else if (outcome === 'pending') {
      setNotice('The purchase is waiting for approval. Your plan changes when it’s approved.');
    } else if (outcome === 'unavailable') {
      setNotice(store.unavailableReason);
    } else if (outcome === 'failed') {
      setNotice('The purchase didn’t go through. Nothing was charged. Try again.');
    }
  };

  const restore = async () => {
    if (busy) return;
    if (!store.available) {
      setNotice(store.unavailableReason);
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await store.restore();
    setBusy(false);
    const now = tierOf(useEntitlements.getState());
    if (result.ok && now !== 'free') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotice(`Restored ${TIER_NAMES[now]}.`);
    } else if (result.ok) {
      setNotice('No active subscription was found for this Apple ID.');
    } else {
      setNotice(result.message ? `Couldn’t restore: ${result.message}` : 'Couldn’t restore purchases. Try again.');
    }
  };

  const links = [
    { label: 'Restore purchases', onPress: restore },
    { label: 'Terms', onPress: () => WebBrowser.openBrowserAsync(TERMS_URL) },
    { label: 'Privacy', onPress: () => WebBrowser.openBrowserAsync(PRIVACY_URL) },
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
            Try Tenfold free for {TRIAL_DAYS} days
          </AppText>
          <AppText variant="body" color={colors.textSecondary}>
            Every plan starts with a {TRIAL_DAYS}-day free trial. Everything still runs on your iPhone.
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
            <PlanCard
              key={p.tier}
              plan={p}
              billing={billing}
              selected={tier === p.tier}
              current={current === p.tier}
              onPress={() => pickTier(p.tier as PaidTier)}
              onLongPress={devSetTier ? () => devSetTier(p.tier as PaidTier) : undefined}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          title={busy ? 'Waiting for the App Store' : tier === current ? `Keep ${plan.name}` : trial ? `Try ${plan.name} free` : `Switch to ${plan.name}`}
          shape="pill"
          disabled={busy}
          onPress={confirm}
        />
        {notice ? (
          <Animated.View entering={FadeIn.duration(motion.fast)}>
            <AppText variant="caption" color={colors.textPrimary} style={styles.center} accessibilityLiveRegion="polite">
              {notice}
            </AppText>
          </Animated.View>
        ) : null}
        <AppText variant="caption" color={colors.textMuted} tabular style={styles.center}>
          {renewalLine(plan, billing, trial)}
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
  onLongPress,
}: {
  plan: PlanInfo;
  billing: Billing;
  selected: boolean;
  current: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const price = priceLine(plan, billing);
  const detail = plan.price ? (billing === 'annual' ? perMonth(plan) : `${TRIAL_DAYS} days free`) : null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
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
