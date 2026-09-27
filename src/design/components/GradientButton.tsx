import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SFSymbol } from '../symbols';
import { colors, radii, sizes } from '../tokens';
import { AppText } from './AppText';
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

/** The one primary action on a screen: solid white, black text (docs/DESIGN.md §1). */
export function GradientButton({
  title,
  onPress,
  icon = false,
  trailingArrow,
  disabled,
  style,
  height = sizes.ctaHeight,
  shape = 'rounded',
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
  tone?: 'outline' | 'violet';
  disabled?: boolean;
};

/** Hairline-bordered secondary button ("+ New Project", "Export", "Cancel" in the reference). */
export function OutlineButton({ title, onPress, icon, height = sizes.ctaHeight, style, tone = 'outline', disabled }: OutlineButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={[
        styles.outline,
        tone === 'violet' && styles.violet,
        { height, borderRadius: Math.min(radii.button, height / 2), opacity: disabled ? 0.45 : 1 },
        style,
      ]}>
      <View style={styles.row}>
        {icon ? <SymbolView name={icon} size={17} tintColor={colors.textPrimary} weight="regular" /> : null}
        <AppText variant={height < 44 ? 'chip' : 'bodyStrong'}>{title}</AppText>
      </View>
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
  outline: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardHigh,
  },
  violet: { backgroundColor: colors.accentSoft },
});
