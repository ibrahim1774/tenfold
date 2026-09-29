import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { themedStyles, useScheme } from '../theme';
import { radii, spacing } from '../tokens';

export type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'default' | 'high';
  dashed?: boolean;
};

/**
 * A raised surface (an iOS inset group): white on the warm light page, graphite on dark. Continuous
 * corners, no border and no shadow: the fill alone separates it from the page.
 */
export function Card({ children, style, padded = true, tone = 'default', dashed }: CardProps) {
  const styles = themed[useScheme()];
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

const themed = themedStyles((p) => ({
  card: {
    backgroundColor: p.card,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  high: { backgroundColor: p.cardHigh },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: p.borderStrong, backgroundColor: 'transparent' },
  padded: { padding: spacing.lg },
}));
