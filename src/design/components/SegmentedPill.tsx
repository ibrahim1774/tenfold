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

/** "Monthly | Yearly 50%" toggle from the reference paywall. */
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
            <AppText variant="bodyStrong" color={selected ? colors.textOnLight : colors.textPrimary}>
              {s.label}
            </AppText>
            {s.badge && (
              <View style={styles.badge}>
                <AppText style={styles.badgeText} color={colors.textPrimary}>
                  {s.badge}
                </AppText>
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
    padding: 5,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  segment: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  selected: {
    backgroundColor: '#FFFFFF',
  },
  badge: {
    backgroundColor: colors.badgeOrange,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 16,
  },
});
