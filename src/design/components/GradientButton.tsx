import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SFSymbol } from '../symbols';
import { useScheme, useTheme } from '../theme';
import { brand, radii, shadows, sizes } from '../tokens';
import { AppText } from './AppText';
import { GlassSurface } from './Glass';
import { PressableScale } from './PressableScale';

export type GradientButtonProps = {
  title: string;
  onPress?: () => void;
  icon?: SFSymbol | false;
  trailingArrow?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  height?: number;
  shape?: 'rounded' | 'pill';
};

/**
 * The one primary action on a screen (docs/DESIGN.md §1): a capsule of the red-orange brand gradient
 * with a white label, the same on light and dark screens.
 */
export function GradientButton({
  title,
  onPress,
  icon = false,
  trailingArrow,
  disabled,
  style,
  height = sizes.ctaHeight,
  shape = 'pill',
}: GradientButtonProps) {
  const radius = shape === 'pill' ? height / 2 : radii.button;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      haptic="impact"
      style={[styles.wrap, { height, borderRadius: radius, opacity: disabled ? 0.4 : 1 }, style]}>
      <LinearGradient
        colors={brand.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      <View style={styles.row}>
        {icon ? <SymbolView name={icon} size={18} tintColor={brand.onBrand} weight="semibold" /> : null}
        <AppText variant="bodyStrong" color={brand.onBrand}>
          {title}
        </AppText>
        {trailingArrow ? <SymbolView name="arrow.right" size={16} tintColor={brand.onBrand} weight="semibold" /> : null}
      </View>
    </PressableScale>
  );
}

export type OutlineButtonProps = {
  title: string;
  onPress?: () => void;
  icon?: SFSymbol;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** 'outline' (default): the neutral secondary. 'violet' (legacy name): the same with brand-coloured text. */
  tone?: 'outline' | 'violet';
  disabled?: boolean;
  shape?: 'rounded' | 'pill';
};

/**
 * Secondary button. On light screens a white capsule that lifts off the page with the soft control
 * shadow; on dark screens a Liquid Glass capsule (graphite where glass isn't available).
 */
export function OutlineButton({
  title,
  onPress,
  icon,
  height = sizes.ctaHeight,
  style,
  tone = 'outline',
  disabled,
  shape = 'pill',
}: OutlineButtonProps) {
  const scheme = useScheme();
  const theme = useTheme();
  const radius = shape === 'pill' ? height / 2 : Math.min(radii.button, height / 2);
  const tint = tone === 'violet' ? theme.accentText : theme.textPrimary;
  const label = (
    <View style={styles.row}>
      {icon ? <SymbolView name={icon} size={17} tintColor={tint} weight="medium" /> : null}
      <AppText variant={height < 44 ? 'chip' : 'bodyStrong'} color={tint}>
        {title}
      </AppText>
    </View>
  );
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={[{ height, borderRadius: radius, opacity: disabled ? 0.45 : 1 }, style]}>
      {scheme === 'light' ? (
        <View style={[styles.outline, styles.lightFill, { height, borderRadius: radius, backgroundColor: theme.card }]}>{label}</View>
      ) : (
        <GlassSurface interactive style={[styles.outline, { height, borderRadius: radius }]}>
          {label}
        </GlassSurface>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    alignItems: 'center',
    borderCurve: 'continuous',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  outline: { justifyContent: 'center', alignItems: 'center', borderCurve: 'continuous' },
  lightFill: shadows.control,
});
