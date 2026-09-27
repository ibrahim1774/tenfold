import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSampleWords } from '@/captions/sampleWords';
import { CAPTION_PRESETS, captionSettingsFromPreset, lookOf } from '@/captions/presets';
import { StyleSample } from '@/captions/StyleSample';
import { useCaptionTarget } from '@/captions/useCaptionTarget';
import { AppText } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';
import { usePaywallGate } from '@/monetization/superwall';
import { lowestTierWhere } from '@/onboarding/plans';
import { captionStyleUnlocked, tierOf, TIER_NAMES, useEntitlements } from '@/state/entitlements';

// Every caption style as a row with a real sample. Picking one replaces the look (font, colours,
// background, outline, animation) and keeps the size and the on/off switch; the sheet then shows it.
export default function StylePicker() {
  const insets = useSafeAreaInsets();
  const { projectId, batchId } = useLocalSearchParams<{ projectId?: string; batchId?: string }>();
  const { settings, update } = useCaptionTarget(projectId, batchId);
  const tier = useEntitlements((s) => tierOf(s));
  const gate = usePaywallGate();
  // The plan that unlocks every style, named on locked rows.
  const unlockTier = lowestTierWhere((l) => l.allCaptionStyles) ?? 'starter';
  const words = useSampleWords(projectId);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        Caption style
      </AppText>
      <View style={styles.group}>
        {CAPTION_PRESETS.map((p, i) => {
          const locked = !captionStyleUnlocked(tier, p.free);
          const apply = () => {
            update((c) => ({ ...captionSettingsFromPreset(p.id), sizeScale: c.sizeScale, enabled: c.enabled }));
            router.back();
          };
          const selected = settings?.styleId === p.id;
          const preset = captionSettingsFromPreset(p.id);
          return (
            <View key={p.id}>
              {i > 0 && <View style={styles.divider} />}
              <Pressable
                onPress={() => {
                  if (!locked) {
                    apply();
                    return;
                  }
                  // Gated: the style is applied once the plan allows it.
                  gate({
                    placement: 'caption_style_locked',
                    params: { style: p.id },
                    allowed: () => captionStyleUnlocked(tierOf(useEntitlements.getState()), p.free),
                    run: apply,
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}${locked ? `, ${TIER_NAMES[unlockTier]}` : ''}`}
                accessibilityState={{ selected }}
                accessibilityHint={locked ? 'Shows plans with every caption style.' : undefined}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <StyleSample look={{ ...preset, ...lookOf(preset) }} words={words} />
                <View style={styles.text}>
                  <AppText variant="body">{p.name}</AppText>
                  {locked && (
                    <View style={styles.pro}>
                      <AppText variant="caption" color={colors.accentText}>
                        {TIER_NAMES[unlockTier]}
                      </AppText>
                    </View>
                  )}
                </View>
                {selected ? <SymbolView name="checkmark" size={15} weight="semibold" tintColor={colors.accent} /> : <View style={styles.check} />}
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  title: { marginLeft: spacing.xs },
  group: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg, backgroundColor: colors.borderStrong },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 8 },
  pressed: { backgroundColor: colors.cardHigh },
  text: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pro: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: colors.accentSoft },
  check: { width: 15 },
});
