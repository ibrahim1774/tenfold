import type { ReactNode } from 'react';
import { StyleSheet, View, type Insets } from 'react-native';

import { themedStyles, useScheme, useTheme } from '../theme';

import { radii, sizes } from '../tokens';
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
  const colors = useTheme();
  const styles = themed[useScheme()];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      scaleTo={0.94}
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
          <AppText variant="caption" color={selected ? colors.chipSelectedText : colors.accentText}>
            {lockLabel}
          </AppText>
        </View>
      ) : null}
    </PressableScale>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={groupStyles.group}>{children}</View>;
}

const themed = themedStyles((colors) => ({
  chip: {
    height: sizes.chipHeight,
    borderRadius: radii.chip,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.chipFill,
  },
  selected: { backgroundColor: colors.chipSelectedFill },
  disabled: { opacity: 0.4 },
  pro: { paddingHorizontal: 6, borderRadius: 6, backgroundColor: colors.accentSoft },
}));

const groupStyles = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
