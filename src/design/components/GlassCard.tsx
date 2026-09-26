import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, spacing } from '../tokens';

export type GlassCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
};

export function GlassCard({ children, style, padded = true }: GlassCardProps) {
  return (
    <View style={[styles.shadow, style]}>
      <View style={styles.clip}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.fill]} />
        <View style={padded ? styles.padding : undefined}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radii.card,
    boxShadow: `0 18px 40px ${colors.glassShadow}`,
  },
  clip: {
    borderRadius: radii.card,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  fill: {
    backgroundColor: colors.glassFill,
  },
  padding: {
    padding: spacing.xl,
  },
});
