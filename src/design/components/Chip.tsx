import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, sizes } from '../tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  locked?: boolean;
};

export function Chip({ label, selected, onPress, disabled, locked }: ChipProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.94}
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={locked ? `${label}, Pro` : label}
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled]}>
      <AppText variant="chip" color={selected ? colors.chipSelectedText : colors.chipText}>
        {label}
      </AppText>
      {locked ? (
        <View style={styles.pro}>
          <AppText variant="caption" color={colors.accentText}>
            Pro
          </AppText>
        </View>
      ) : null}
    </PressableScale>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    height: sizes.chipHeight,
    borderRadius: radii.chip,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.chipFill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { backgroundColor: colors.chipSelectedFill, borderColor: colors.chipSelectedFill },
  disabled: { opacity: 0.4 },
  pro: { paddingHorizontal: 6, borderRadius: 6, backgroundColor: colors.violetSoft },
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
