import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTION_FONTS, withLook } from '@/captions/presets';
import { useCaptionTarget } from '@/captions/useCaptionTarget';
import { AppText } from '@/design/components';
import { colors, radii, spacing } from '@/design/tokens';

// Caption fonts, each name drawn in its own face. Picking one keeps the rest of the look (style → Custom).
export default function FontPicker() {
  const insets = useSafeAreaInsets();
  const { projectId, batchId } = useLocalSearchParams<{ projectId?: string; batchId?: string }>();
  const { settings, update } = useCaptionTarget(projectId, batchId);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        Caption font
      </AppText>
      <View style={styles.group}>
        {CAPTION_FONTS.map((f, i) => {
          const selected = settings?.font === f.id;
          const face: TextStyle = f.family !== 'System' ? { fontFamily: f.family } : { fontWeight: '900' };
          return (
            <View key={f.id}>
              {i > 0 && <View style={styles.divider} />}
              <Pressable
                onPress={() => {
                  if (!selected) update((c) => withLook(c, { font: f.id }));
                  router.back();
                }}
                accessibilityRole="button"
                accessibilityLabel={f.name}
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <AppText variant="title" style={[styles.name, face]} numberOfLines={1}>
                  {f.name}
                </AppText>
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
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  pressed: { backgroundColor: colors.cardHigh },
  name: { flex: 1 },
  check: { width: 15 },
});
