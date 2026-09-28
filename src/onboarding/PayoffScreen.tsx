import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/design/components';
import { colors, spacing } from '@/design/tokens';

import { payoffHeadline, type Payoff as PayoffNumbers } from './savings';

export function Payoff({ payoff }: { payoff: PayoffNumbers }) {
  const title = payoffHeadline(payoff);
  return (
    <View style={styles.wrap}>
      <AppText variant="display" tabular accessibilityRole="header">
        {title}
      </AppText>
      <Card style={styles.maths}>
        {payoff.lines.map((l) => (
          <AppText key={l} variant="caption" color={colors.textSecondary} tabular>
            {l}
          </AppText>
        ))}
      </Card>
      <AppText variant="label" color={colors.textMuted}>
        Based only on what you told us.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.gutter, gap: spacing.lg },
  maths: { gap: spacing.xs },
});
