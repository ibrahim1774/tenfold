import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, gradients, radii, sizes } from '../tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type GradientButtonProps = {
  title: string;
  onPress?: () => void;
  icon?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  height?: number;
};

export function GradientButton({ title, onPress, icon = true, disabled, style, height = sizes.ctaHeight }: GradientButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.wrap, { height, borderRadius: height / 2, opacity: disabled ? 0.5 : 1 }, style]}>
      <LinearGradient
        colors={gradients.cta}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { borderRadius: height / 2 }]}
      />
      <View style={styles.row}>
        {icon && <SymbolView name="sparkles" size={20} tintColor={colors.textPrimary} weight="semibold" />}
        <AppText variant="cta">{title}</AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.cta,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 12px 28px rgba(176,124,255,0.35)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
