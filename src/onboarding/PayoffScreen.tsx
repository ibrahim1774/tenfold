import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/components';
import { colors, fonts, spacing } from '@/design/tokens';

import { formatMinutes, type Payoff as PayoffNumbers } from './savings';

/**
 * "Editing costs you about X a month" (struck through), then the time saved as one big number.
 * The maths sits underneath in small type, so the claim is always traceable to the two answers.
 */
export function Payoff({ payoff }: { payoff: PayoffNumbers }) {
  // Whole hours from one hour up, minutes below that.
  const big = payoff.hours >= 1 ? String(payoff.hours) : String(Math.round(payoff.savedMinutes));
  const unit = payoff.hours >= 1 ? (payoff.hours === 1 ? 'hour' : 'hours') : 'min';
  const saved = `${big} ${unit}`;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <AppText variant="label" color={colors.textMuted}>
          ESTIMATED FROM YOUR ANSWERS
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          Editing costs you
        </AppText>
        <AppText variant="title" color={colors.textSecondary} tabular style={styles.struck}>
          about {formatMinutes(payoff.editingMinutes)} a month
        </AppText>
      </View>

      <View style={styles.hero} accessible accessibilityRole="header" accessibilityLabel={`You will save about ${saved} every single month.`}>
        <AppText variant="body" color={colors.textSecondary}>
          You will save about
        </AppText>
        <View style={styles.numberRow}>
          <AppText style={styles.number} tabular maxFontSizeMultiplier={1.2}>
            {big}
          </AppText>
          <AppText variant="display" style={styles.unit}>
            {unit}
          </AppText>
        </View>
        <AppText variant="body" color={colors.textSecondary}>
          every single month.
        </AppText>
      </View>

      <View style={styles.maths}>
        {payoff.lines.map((l) => (
          <AppText key={l} variant="caption" color={colors.textMuted} tabular>
            {l}
          </AppText>
        ))}
        <AppText variant="caption" color={colors.textMuted}>
          Based only on what you told us.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 520, paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.xl },
  top: { gap: spacing.xs },
  struck: { textDecorationLine: 'line-through', textDecorationColor: colors.textSecondary },
  hero: { gap: spacing.xs },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  // The one oversized figure on the screen, like the reference onboarding.
  number: { fontFamily: fonts.bold, fontSize: 104, lineHeight: 112, color: colors.accent, letterSpacing: -3 },
  unit: { marginBottom: 18 },
  maths: { marginTop: 'auto', gap: 2 },
});
