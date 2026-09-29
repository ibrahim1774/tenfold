import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Background, GradientButton, IconButton } from '@/design/components';
import { sampleFrame } from '@/design/sampleFrames';
import { light, motion, radii, shadows, spacing } from '@/design/tokens';
import { useStoreActions, type StorePrice } from '@/monetization/superwall';
import {
  annualSavingPercent,
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

const HERO = 260;
const BENEFITS = ['Silences and filler words cut', 'Word-by-word captions', 'Framed for vertical', 'No watermark'];

// Tenfold's own paywall. Superwall presents the paywalls normally (src/monetization); this screen is the
// fallback when this build has no Superwall module or a paywall can't be presented.
export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const current = useEntitlements((s) => tierOf(s));
  const currentBilling = useEntitlements((s) => s.billing);
  const setTier = useEntitlements((s) => s.setTier);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const store = useStoreActions();
  // A subscriber starts on the billing period they pay now, so switching monthly ↔ annual is one tap.
  const [billing, setBilling] = useState<Billing>(currentBilling ?? 'annual');
  const [tier, setSelected] = useState<PaidTier>(current === 'free' ? 'pro' : current);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fromOnboarding = from === 'onboarding';
  // Apple gives one free trial per subscription group: subscribers switching plans don't get another.
  const trial = current === 'free';
  // Already on this plan (same billing, or billing not known yet): nothing to buy.
  const onCurrentPlan = tier === current && (!currentBilling || billing === currentBilling);
  const billingSwitch = tier === current && !onCurrentPlan;
  const plan = planFor(tier);
  // The App Store's prices in the person's currency, when all six loaded; otherwise USD everywhere (never mixed).
  const local = store.prices;
  const localized = PLANS.every((p) => local?.[PRODUCT_IDS[p.tier as PaidTier].monthly] && local?.[PRODUCT_IDS[p.tier as PaidTier].annual]);
  const storePrice = (t: PaidTier, b: Billing) => (localized ? local?.[PRODUCT_IDS[t][b]] : undefined);
  const saving = localized
    ? Math.min(
        ...PLANS.map((p) =>
          annualSavingPercent({
            price: { monthly: storePrice(p.tier as PaidTier, 'monthly')!.price, annual: storePrice(p.tier as PaidTier, 'annual')!.price },
          }),
        ),
      )
    : annualSavingPill();

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
    if (onCurrentPlan) {
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
    <View style={[styles.flex, { paddingBottom: insets.bottom + spacing.xs }]}>
      <Background />

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* A real take across the top, dissolving into the page; the offer sits where it fades out. */}
        <View style={[styles.hero, { height: HERO + insets.top }]}>
          <Image source={sampleFrame(4)} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={0} />
          <LinearGradient
            colors={[light.bgClear, light.bgClear, light.bg]}
            locations={[0, 0.45, 0.92]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* A light veil under the status bar, so its dark glyphs read over the footage. */}
          <LinearGradient
            colors={[light.chrome, light.bgClear]}
            style={[styles.veil, { height: insets.top + 48 }]}
            pointerEvents="none"
          />
          <View style={styles.heroText}>
            <AppText variant="display" accessibilityRole="header">
              {trial ? `Try Tenfold free for ${TRIAL_DAYS} days` : 'Choose your plan'}
            </AppText>
          </View>
        </View>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefit}>
              <SymbolView name="checkmark" size={14} tintColor={light.accent} weight="bold" />
              <AppText variant="body">{b}</AppText>
            </View>
          ))}
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
                <AppText variant="chip" color={on ? light.textPrimary : light.textSecondary}>
                  {b === 'annual' ? 'Annual' : 'Monthly'}
                </AppText>
                {b === 'annual' && saving > 0 ? (
                  <View style={styles.savePill}>
                    <AppText variant="caption" color={light.accentText} tabular>
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
              trial={trial}
              localized={storePrice(p.tier as PaidTier, billing)}
              selected={tier === p.tier}
              current={current === p.tier}
              onPress={() => pickTier(p.tier as PaidTier)}
              onLongPress={devSetTier ? () => devSetTier(p.tier as PaidTier) : undefined}
            />
          ))}
        </View>
      </ScrollView>

      {/* Over the image, so it stays put while the page scrolls. */}
      <View style={[styles.top, { top: insets.top + spacing.xs }]}>
        <IconButton icon="xmark" label={fromOnboarding ? 'Not now' : 'Close'} onPress={close} />
      </View>

      <View style={styles.footer}>
        <GradientButton
          title={busy ? 'Waiting for the App Store' : onCurrentPlan ? `Keep ${plan.name}` : billingSwitch ? `Switch to ${plan.name} ${billing === 'annual' ? 'Annual' : 'Monthly'}` : trial ? `Try ${plan.name} free` : `Switch to ${plan.name}`}
          shape="pill"
          disabled={busy}
          onPress={confirm}
        />
        {notice ? (
          <Animated.View entering={FadeIn.duration(motion.fast).reduceMotion(ReduceMotion.System)}>
            <AppText variant="caption" color={light.textPrimary} style={styles.center} accessibilityLiveRegion="polite">
              {notice}
            </AppText>
          </Animated.View>
        ) : null}
        <AppText variant="caption" color={light.textMuted} tabular style={styles.center}>
          {renewalLine(plan, billing, trial, storePrice(tier, billing)?.localizedPrice)}
        </AppText>

        <Pressable onPress={close} accessibilityRole="button" style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
          <AppText variant="bodyStrong" color={light.textSecondary}>
            Not now
          </AppText>
        </Pressable>

        <View style={styles.links}>
          {links.map(({ label, onPress }) => (
            <Pressable key={label} onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
              <AppText variant="caption" color={light.textMuted}>
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
  trial,
  localized,
  selected,
  current,
  onPress,
  onLongPress,
}: {
  plan: PlanInfo;
  billing: Billing;
  trial: boolean;
  /** The App Store's price for this plan and billing, when loaded. */
  localized?: StorePrice;
  selected: boolean;
  current: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const price = priceLine(plan, billing, localized?.localizedPrice);
  const detail = plan.price
    ? billing === 'annual'
      ? perMonth(plan, localized?.monthlyPrice)
      : trial
        ? `${TRIAL_DAYS} days free`
        : null
    : null;
  // The fact that tells the plans apart; the full list is in the VoiceOver label.
  const facts = plan.features[1];
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
          tintColor={selected ? light.accent : light.glyph}
          weight="regular"
        />
        <View style={styles.flex}>
          <View style={styles.planName}>
            <AppText variant="bodyStrong">{plan.name}</AppText>
            {current ? (
              <AppText variant="caption" color={light.textMuted}>
                Your plan
              </AppText>
            ) : null}
          </View>
          <AppText variant="label" color={light.textSecondary} tabular numberOfLines={1}>
            {facts}
          </AppText>
        </View>
        <View style={styles.priceCol}>
          <AppText variant="bodyStrong" tabular>
            {price}
          </AppText>
          {detail ? (
            <AppText variant="caption" color={light.textMuted} tabular>
              {detail}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  top: { position: 'absolute', right: spacing.md },
  content: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.xl, gap: spacing.xl },
  hero: { marginHorizontal: -spacing.gutter, justifyContent: 'flex-end', backgroundColor: light.bg },
  heroText: { paddingHorizontal: spacing.gutter },
  veil: { position: 'absolute', top: 0, left: 0, right: 0 },
  benefits: { gap: spacing.sm, marginTop: -spacing.sm },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  segment: { flexDirection: 'row', padding: 3, borderRadius: radii.button, backgroundColor: light.cardHigh },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.button - 3,
  },
  segmentOn: { backgroundColor: light.card, ...shadows.control },
  savePill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.round, backgroundColor: light.accentSoft },

  plans: { gap: spacing.sm },
  plan: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    // Constant width so selecting a plan doesn't shift the layout; only the selected plan shows a ring.
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: light.card,
  },
  planOn: { borderColor: light.accent },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  planName: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceCol: { alignItems: 'flex-end' },

  footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.xs },
  textButton: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  pressed: { opacity: 0.6 },
});
