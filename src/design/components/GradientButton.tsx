import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SFSymbol } from '../symbols';
import { colors, radii, sizes } from '../tokens';
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
 * The one primary action on a screen: a flat white capsule with black text, like iOS 26's prominent
 * buttons (docs/DESIGN.md §1). No gradient, glow or shadow; the name stays for its many call sites.
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
      <View style={styles.row}>
        {icon ? <SymbolView name={icon} size={18} tintColor={colors.textInverse} weight="semibold" /> : null}
        <AppText variant="bodyStrong" color={colors.textInverse}>
          {title}
        </AppText>
        {trailingArrow ? <SymbolView name="arrow.right" size={16} tintColor={colors.textInverse} weight="semibold" /> : null}
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
  /** 'outline' (default): glass capsule. 'violet' (legacy name): the same with accent text. */
  tone?: 'outline' | 'violet';
  disabled?: boolean;
  shape?: 'rounded' | 'pill';
};

/** Secondary button: a Liquid Glass capsule (graphite fill where glass isn't available). */
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
  const radius = shape === 'pill' ? height / 2 : Math.min(radii.button, height / 2);
  const tint = tone === 'violet' ? colors.accentText : colors.textPrimary;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={[{ height, borderRadius: radius, opacity: disabled ? 0.45 : 1 }, style]}>
      <GlassSurface interactive style={[styles.outline, { height, borderRadius: radius }]}>
        <View style={styles.row}>
          {icon ? <SymbolView name={icon} size={17} tintColor={tint} weight="medium" /> : null}
          <AppText variant={height < 44 ? 'chip' : 'bodyStrong'} color={tint}>
            {title}
          </AppText>
        </View>
      </GlassSurface>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  outline: { justifyContent: 'center', alignItems: 'center' },
});
