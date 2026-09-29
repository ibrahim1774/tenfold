import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SFSymbol } from '../symbols';
import { colors, sizes } from '../tokens';
import { GlassSurface, glassAvailable } from './Glass';
import { PressableScale } from './PressableScale';

export type IconButtonProps = {
  icon: SFSymbol;
  label: string;
  onPress?: () => void;
  size?: number;
  /**
   * 'glass' (default): a Liquid Glass circle for chrome floating over content (back, close, more, +).
   * 'filled': a flat graphite circle for controls inside content (steppers in a sheet).
   * 'ghost': a bare glyph (undo/redo in a toolbar that is itself glass).
   * 'outline' and 'solid' are legacy names for 'glass'.
   */
  tone?: 'glass' | 'filled' | 'ghost' | 'outline' | 'solid';
  disabled?: boolean;
  /** Glyph size as a fraction of the circle (default ~17 pt on a 44 pt circle). */
  iconScale?: number;
};

export function IconButton({
  icon,
  label,
  onPress,
  size = sizes.iconButton,
  tone = 'glass',
  disabled,
  iconScale = 0.39,
}: IconButtonProps) {
  const glyph = <SymbolView name={icon} size={Math.round(size * iconScale)} tintColor={colors.textPrimary} weight="medium" />;
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const isGlass = tone === 'glass' || tone === 'outline' || tone === 'solid';

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      // Interactive glass has its own press response; keep the scale subtle on top of it.
      scaleTo={isGlass && glassAvailable() ? 0.96 : 0.92}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={[circle, { opacity: disabled ? 0.35 : 1 }]}>
      {isGlass ? (
        <GlassSurface interactive style={[styles.center, circle]}>
          {glyph}
        </GlassSurface>
      ) : (
        <GlassFreeCircle filled={tone === 'filled'} circle={circle}>
          {glyph}
        </GlassFreeCircle>
      )}
    </PressableScale>
  );
}

function GlassFreeCircle({
  filled,
  circle,
  children,
}: {
  filled: boolean;
  circle: { width: number; height: number; borderRadius: number };
  children: ReactNode;
}) {
  return <View style={[styles.center, circle, filled && styles.filled]}>{children}</View>;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: colors.cardHigh },
});
