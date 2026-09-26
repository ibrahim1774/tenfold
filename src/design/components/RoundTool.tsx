import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from '../symbols';
import { StyleSheet, View } from 'react-native';

import { colors, sizes } from '../tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type RoundToolProps = {
  icon: SFSymbol;
  label: string;
  onPress?: () => void;
  active?: boolean;
};

/** 64 pt editor tool circle on the blue panel (reference screen 1). */
export function RoundTool({ icon, label, onPress, active }: RoundToolProps) {
  return (
    <View style={styles.wrap}>
      <PressableScale
        onPress={onPress}
        scaleTo={0.92}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.circle, active && styles.active]}>
        <SymbolView name={icon} size={26} tintColor={colors.textPrimary} weight="regular" />
      </PressableScale>
      <AppText variant="caption" color={colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

export function ToolPanel({ children }: { children: React.ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    width: sizes.roundTool,
    height: sizes.roundTool,
    borderRadius: sizes.roundTool / 2,
    backgroundColor: colors.toolFill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  active: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  panel: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: colors.toolPanel,
    borderRadius: 28,
    borderCurve: 'continuous',
  },
});
