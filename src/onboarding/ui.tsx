import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, radii, spacing } from '@/design/tokens';

/** Screen title plus one line saying why we ask. */
export function StepHead({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <View style={styles.head}>
      <AppText variant="display" accessibilityRole="header">
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" color={colors.textSecondary}>
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

export type Choice<T extends string> = { v: T; label: string; detail?: string; icon?: SFSymbol };

/** Grouped inset rows like iOS Settings. Single choice shows a radio; multi shows checkmarks. */
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
    <View style={styles.group} accessibilityRole={multi ? undefined : 'radiogroup'}>
      {choices.map((c, i) => {
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
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            {/* iOS inset-group hairline: starts where the text starts, not at the edge. */}
            {i > 0 ? <View style={[styles.divider, { left: c.icon ? DIVIDER_ICON_INSET : spacing.lg }]} /> : null}
            {c.icon ? <SymbolView name={c.icon} size={20} tintColor={colors.textPrimary} weight="regular" style={styles.icon} /> : null}
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{c.label}</AppText>
              {c.detail ? (
                <AppText variant="label" color={colors.textSecondary}>
                  {c.detail}
                </AppText>
              ) : null}
            </View>
            <SymbolView
              name={on ? 'checkmark.circle.fill' : 'circle'}
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

const ICON_SIZE = 24;
const DIVIDER_ICON_INSET = spacing.lg + ICON_SIZE + spacing.lg;

export const onboardingStyles = StyleSheet.create({
  pad: { flexGrow: 1, paddingHorizontal: spacing.gutter, gap: spacing.xxl, paddingBottom: spacing.lg },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { gap: spacing.sm },
  group: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 56, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  divider: { position: 'absolute', top: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  pressed: { backgroundColor: colors.cardHigh },
  icon: { width: ICON_SIZE, height: ICON_SIZE },
});
