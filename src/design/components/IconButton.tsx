import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from '../symbols';
import { StyleSheet } from 'react-native';

import { colors, sizes } from '../tokens';
import { PressableScale } from './PressableScale';

export type IconButtonProps = {
  icon: SFSymbol;
  label: string;
  onPress?: () => void;
  size?: number;
  tone?: 'glass' | 'light';
  disabled?: boolean;
};

/** Circular translucent button: back, more, chevrons, + (reference screens 2 and 3). */
export function IconButton({ icon, label, onPress, size = sizes.iconButton, tone = 'glass', disabled }: IconButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.4 : 1 },
        tone === 'light' ? styles.light : styles.glass,
      ]}>
      <SymbolView name={icon} size={size * 0.42} tintColor={colors.textPrimary} weight="medium" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  light: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
});
