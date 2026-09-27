import { SymbolView } from 'expo-symbols';
import { StyleSheet } from 'react-native';

import type { SFSymbol } from '../symbols';
import { colors, sizes } from '../tokens';
import { PressableScale } from './PressableScale';

export type IconButtonProps = {
  icon: SFSymbol;
  label: string;
  onPress?: () => void;
  size?: number;
  tone?: 'outline' | 'ghost' | 'solid';
  disabled?: boolean;
  iconScale?: number;
};

/** A round filled glyph (back, close, more) or a bare glyph (undo/redo). */
export function IconButton({
  icon,
  label,
  onPress,
  size = sizes.iconButton,
  tone = 'outline',
  disabled,
  iconScale = 0.4,
}: IconButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.9}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.35 : 1 },
        tone === 'outline' && styles.outline,
        tone === 'solid' && styles.solid,
      ]}>
      <SymbolView name={icon} size={size * iconScale} tintColor={colors.textPrimary} weight="regular" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  outline: { backgroundColor: colors.cardHigh },
  solid: { backgroundColor: colors.cardHigh },
});
