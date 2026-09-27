import { StyleSheet, View } from 'react-native';

import { colors, fonts } from '../tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type Segment<T extends string> = { value: T; label: string; badge?: string };

export type SegmentedPillProps<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedPill<T extends string>({ segments, value, onChange }: SegmentedPillProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <PressableScale
            key={s.value}
            onPress={() => onChange(s.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.selected]}>
            <AppText variant="bodyStrong" color={selected ? colors.textInverse : colors.textPrimary}>
              {s.label}
            </AppText>
            {s.badge && (
              <View style={styles.badge}>
                <AppText style={styles.badgeText}>{s.badge}</AppText>
              </View>
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  segment: {
    flex: 1,
    height: 46,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  selected: { backgroundColor: '#FFFFFF' },
  badge: { backgroundColor: colors.orange, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: '#FFFFFF' },
});
