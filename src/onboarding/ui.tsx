import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, radii, spacing } from '@/design/tokens';

/** Screen title, plus one short line only where it prevents a mistake. */
export function StepHead({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <View style={styles.head}>
      <AppText variant="display" accessibilityRole="header">
        {title}
      </AppText>
      {body ? (
        <AppText variant="label" color={colors.textSecondary}>
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

export type Choice<T extends string> = { v: T; label: string; detail?: string; icon?: SFSymbol };

/**
 * Tall, quiet answer rows on the black page: the label alone, a mark on the right. The chosen row lifts
 * onto a graphite fill. `detail` stays in the VoiceOver label; the screen keeps to the label.
 */
export function ChoiceList<T extends string>({
  choices,
  selected,
  onToggle,
  multi,
}: {
  choices: Choice<T>[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  multi?: boolean;
}) {
  return (
    <View style={styles.list} accessibilityRole={multi ? undefined : 'radiogroup'}>
      {choices.map((c) => {
        const on = selected.includes(c.v);
        return (
          <Pressable
            key={c.v}
            onPress={() => {
              Haptics.selectionAsync();
              onToggle(c.v);
            }}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: on }}
            accessibilityLabel={c.detail ? `${c.label}. ${c.detail}` : c.label}
            style={({ pressed }) => [styles.row, on && styles.on, pressed && !on && styles.pressed]}>
            <AppText variant="bodyStrong" color={on ? colors.textPrimary : colors.textSecondary} style={styles.flex}>
              {c.label}
            </AppText>
            <SymbolView
              name={on ? (multi ? 'checkmark.square.fill' : 'checkmark.circle.fill') : multi ? 'square' : 'circle'}
              size={22}
              tintColor={on ? colors.textPrimary : colors.textMuted}
              weight="regular"
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export const onboardingStyles = StyleSheet.create({
  pad: { flexGrow: 1, paddingHorizontal: spacing.gutter, gap: spacing.xxl, paddingBottom: spacing.lg },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { gap: spacing.sm },
  list: { gap: spacing.xs, marginHorizontal: -spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    borderRadius: radii.card,
    borderCurve: 'continuous',
  },
  on: { backgroundColor: colors.card },
  pressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
});
