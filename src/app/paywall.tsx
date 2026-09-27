import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTION_PRESETS } from '@/captions/presets';
import { AppText, Background, GradientButton, IconButton } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, radii, spacing } from '@/design/tokens';
import { FREE_LIMITS, PRO_BATCH_SIZE, useEntitlements } from '@/state/entitlements';
import { useSettings } from '@/state/settings';

type Plan = 'monthly' | 'yearly';

// M5: products, prices and trial eligibility come from Superwall. These strings are
// placeholders replaced by the store's localized price strings; never ship them hardcoded.
const MOCK_OFFERING: Record<Plan, { price: string; amount: number; per: string; trialDays: number }> = {
  monthly: { price: '$9.99', amount: 9.99, per: 'month', trialDays: 0 },
  yearly: { price: '$49.99', amount: 49.99, per: 'year', trialDays: 7 },
};

const yearlyPerMonth = `$${(MOCK_OFFERING.yearly.amount / 12).toFixed(2)}`;
const yearlySaving = Math.round((1 - MOCK_OFFERING.yearly.amount / (MOCK_OFFERING.monthly.amount * 12)) * 100);
const freeCaptionStyles = CAPTION_PRESETS.filter((p) => p.free).length;

// What Pro adds, each with what the free plan gets today (numbers come from the same limits the app enforces).
const FEATURES: { icon: SFSymbol; title: string; free: string }[] = [
  { icon: 'infinity', title: 'Unlimited exports', free: `Free: ${FREE_LIMITS.exportsPerMonth} a month` },
  { icon: 'square.stack', title: `Batches of up to ${PRO_BATCH_SIZE} clips`, free: `Free: ${FREE_LIMITS.batchSize} at a time` },
  { icon: 'drop', title: 'No watermark', free: 'Free: exports carry a small Tenfold watermark' },
  { icon: '4k.tv', title: '4K export', free: 'From 4K source clips. Free: 1080p' },
  {
    icon: 'captions.bubble',
    title: `All ${CAPTION_PRESETS.length} caption styles`,
    free: `Free: ${freeCaptionStyles} styles`,
  },
];

const LINKS = [
  { label: 'Restore purchases', onPress: () => Alert.alert('Restore purchases', 'Restoring arrives with subscriptions in the next update.') },
  // Apple's standard licence agreement until Tenfold has its own terms page.
  { label: 'Terms', onPress: () => WebBrowser.openBrowserAsync('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/') },
  {
    label: 'Privacy',
    onPress: () =>
      Alert.alert('Privacy', 'Tenfold edits everything on your iPhone. No account, no uploads, no analytics. Your videos never leave your phone.'),
  },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [plan, setPlan] = useState<Plan>('yearly');
  const setPro = useEntitlements((s) => s.setPro);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const offer = MOCK_OFFERING[plan];
  const fromOnboarding = from === 'onboarding';

  const choose = (p: Plan) => {
    if (p !== plan) Haptics.selectionAsync();
    setPlan(p);
  };

  const close = () => {
    if (fromOnboarding) {
      setOnboarded(true);
      router.replace('/');
    } else {
      router.back();
    }
  };

  const subscribe = () => {
    // Placeholder until Superwall (M5): dev builds can unlock Pro to test; release builds never get it free.
    if (__DEV__) {
      setPro(true);
      close();
    } else {
      Alert.alert('Coming soon', 'Subscriptions open with the next update.');
    }
  };

  const cta = offer.trialDays > 0 ? `Start ${offer.trialDays}-day free trial` : `Subscribe for ${offer.price} a ${offer.per}`;
  const terms =
    offer.trialDays > 0
      ? `Free for ${offer.trialDays} days, then ${offer.price} a ${offer.per}. Cancel anytime in Settings.`
      : `${offer.price} a ${offer.per}. Cancel anytime in Settings.`;

  return (
    <View style={[styles.flex, { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xs }]}>
      <Background />

      <View style={styles.top}>
        <IconButton icon="xmark" label={fromOnboarding ? 'Continue with free plan' : 'Close'} size={44} tone="ghost" onPress={close} />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <AppText variant="label" color={colors.textSecondary}>
            Tenfold Pro
          </AppText>
          <AppText variant="display">Unlimited exports, no watermark</AppText>
          <AppText variant="body" color={colors.textSecondary}>
            Everything still runs on your iPhone. No account, no uploads.
          </AppText>
        </View>

        <View style={styles.group}>
          {FEATURES.map((f, i) => (
            <View key={f.title} style={[styles.featureRow, i > 0 && styles.divider]} accessible accessibilityLabel={`${f.title}. ${f.free}`}>
              <SymbolView name={f.icon} size={20} tintColor={colors.textPrimary} weight="regular" style={styles.featureIcon} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{f.title}</AppText>
                <AppText variant="label" color={colors.textMuted}>
                  {f.free}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.plans} accessibilityRole="radiogroup">
          <PlanRow
            selected={plan === 'yearly'}
            onPress={() => choose('yearly')}
            name="Yearly"
            badge={`Save ${yearlySaving}%`}
            price={`${MOCK_OFFERING.yearly.price} a year`}
            detail={`${yearlyPerMonth} a month · ${MOCK_OFFERING.yearly.trialDays} days free`}
          />
          <PlanRow
            selected={plan === 'monthly'}
            onPress={() => choose('monthly')}
            name="Monthly"
            price={`${MOCK_OFFERING.monthly.price} a month`}
            detail="No free trial"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton title={cta} shape="pill" onPress={subscribe} />
        <AppText variant="caption" color={colors.textMuted} tabular style={styles.center}>
          {terms}
        </AppText>

        {fromOnboarding && (
          <Pressable onPress={close} accessibilityRole="button" style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <AppText variant="bodyStrong" color={colors.textSecondary}>
              Continue with free plan
            </AppText>
          </Pressable>
        )}

        <View style={styles.links}>
          {LINKS.map(({ label, onPress }) => (
            <Pressable
              key={label}
              onPress={onPress}
              accessibilityRole="link"
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
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

function PlanRow({
  selected,
  onPress,
  name,
  badge,
  price,
  detail,
}: {
  selected: boolean;
  onPress: () => void;
  name: string;
  badge?: string;
  price: string;
  detail: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${name}, ${price}. ${detail}${badge ? `. ${badge}` : ''}`}
      style={({ pressed }) => [styles.plan, selected && styles.planOn, pressed && styles.pressed]}>
      <SymbolView
        name={selected ? 'checkmark.circle.fill' : 'circle'}
        size={22}
        tintColor={selected ? colors.textPrimary : colors.textMuted}
        weight="regular"
      />
      <View style={styles.flex}>
        <View style={styles.planName}>
          <AppText variant="bodyStrong">{name}</AppText>
          {badge ? (
            <AppText variant="caption" color={colors.orange} tabular>
              {badge}
            </AppText>
          ) : null}
        </View>
        <AppText variant="label" color={colors.textSecondary} tabular>
          {detail}
        </AppText>
      </View>
      <AppText variant="bodyStrong" tabular>
        {price}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md },
  content: { paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.xxl },
  head: { gap: spacing.sm },

  group: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60 },
  featureIcon: { width: 24, height: 24 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },

  plans: { gap: spacing.md },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  planOn: { borderColor: colors.textPrimary, backgroundColor: colors.cardHigh },
  planName: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, gap: spacing.sm },
  textButton: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  pressed: { opacity: 0.6 },
});
