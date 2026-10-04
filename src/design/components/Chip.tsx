import type { ReactNode } from 'react';
import { StyleSheet, View, type Insets } from 'react-native';

import { colors, radii, sizes } from '../tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  locked?: boolean;
  /** Badge on a locked chip: the plan that unlocks it. */
  lockLabel?: string;
  /** Extends the touch area to 44 pt where the chip sits in a plain row (not inside a ScrollView, which clips it). */
  hitSlop?: number | Insets;
};

export function Chip({ label, selected, onPress, disabled, locked, lockLabel = 'Paid', hitSlop }: ChipProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      scaleTo={0.94}
      pop={selected}
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={locked ? `${label}, ${lockLabel}` : label}
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled]}>
      <AppText variant="chip" color={selected ? colors.chipSelectedText : colors.chipText}>
        {label}
      </AppText>
      {locked ? (
        <View style={styles.pro}>
          <AppText variant="caption" color={colors.accentText}>
            {lockLabel}
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
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.chipFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.edge,
  },
  selected: { backgroundColor: colors.chipSelectedFill, borderColor: colors.chipSelectedFill },
  disabled: { opacity: 0.4 },
  pro: { paddingHorizontal: 6, borderRadius: 6, backgroundColor: colors.violetSoft },
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
