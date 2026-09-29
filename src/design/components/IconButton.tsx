import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SFSymbol } from '../symbols';
import { useScheme, useTheme } from '../theme';
import { media, shadows, sizes } from '../tokens';
import { GlassSurface, glassAvailable } from './Glass';
import { PressableScale } from './PressableScale';

export type IconButtonProps = {
  icon: SFSymbol;
  label: string;
  onPress?: () => void;
  size?: number;
  /**
   * 'glass' (default): chrome floating over content (back, close, more, +). A Liquid Glass circle on
   * dark screens; on light screens a white circle lifted by the soft control shadow.
   * 'filled': a flat neutral circle for controls inside content (steppers in a sheet).
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
  const scheme = useScheme();
  const theme = useTheme();
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const floating = tone === 'glass' || tone === 'outline' || tone === 'solid';
  const isGlass = floating && scheme === 'dark';
  // Glass draws dark whatever the page, so its glyph is the dark palette's white.
  const glyph = (
    <SymbolView name={icon} size={Math.round(size * iconScale)} tintColor={isGlass ? media.text : theme.textPrimary} weight="medium" />
  );

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
        <GlassFreeCircle fill={floating ? theme.card : tone === 'filled' ? theme.cardHigh : undefined} lifted={floating} circle={circle}>
          {glyph}
        </GlassFreeCircle>
      )}
    </PressableScale>
  );
}

function GlassFreeCircle({
  fill,
  lifted,
  circle,
  children,
}: {
  fill?: string;
  lifted: boolean;
  circle: { width: number; height: number; borderRadius: number };
  children: ReactNode;
}) {
  return <View style={[styles.center, circle, fill ? { backgroundColor: fill } : null, lifted && styles.lifted]}>{children}</View>;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  lifted: shadows.control,
});
