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
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={locked ? `${label}, Pro` : label}
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled]}>
      <AppText variant="chip" color={selected ? colors.chipSelectedText : colors.chipText}>
        {label}
        {locked ? '  PRO' : ''}
      </AppText>
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
    paddingHorizontal: 22,
    justifyContent: 'center',
    backgroundColor: colors.chipFill,
  },
  selected: {
    backgroundColor: colors.chipSelectedFill,
  },
  disabled: {
    opacity: 0.45,
  },
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
