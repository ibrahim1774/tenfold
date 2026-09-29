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

/** Flat raised surface (an iOS inset group): graphite fill, continuous corners, no border or shadow. */
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
    overflow: 'hidden',
  },
  high: { backgroundColor: colors.cardHigh },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'transparent' },
  padded: { padding: spacing.lg },
});
