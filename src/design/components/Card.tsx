import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, spacing } from '../tokens';

export type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'default' | 'high';
  dashed?: boolean;
};

/** Flat raised surface with a hairline border. */
export function Card({ children, style, padded = true, tone = 'default', dashed }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        tone === 'high' && styles.high,
        dashed && styles.dashed,
        padded && styles.padded,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  high: { backgroundColor: colors.cardHigh },
  dashed: { borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'transparent' },
  padded: { padding: spacing.lg },
});
