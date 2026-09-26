import { SymbolView } from 'expo-symbols';
import { StyleSheet } from 'react-native';

import type { SFSymbol } from '../symbols';
import { colors } from '../tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type ToolButtonProps = {
  icon: SFSymbol;
  label: string;
  onPress?: () => void;
  active?: boolean;
};

/** Line icon over a small label (Canvas / Audio / Text … row in the reference editor). */
export function ToolButton({ icon, label, onPress, active }: ToolButtonProps) {
  const tint = active ? '#C9B6FF' : colors.textPrimary;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={styles.wrap}>
      <SymbolView name={icon} size={26} tintColor={tint} weight="light" />
      <AppText variant="label" color={active ? tint : colors.textSecondary}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, minWidth: 52 },
});
