import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, motion } from '../tokens';

export type ToggleProps = {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
};

const W = 38;
const H = 22;
const KNOB = 14;

/** Outlined pill switch. */
export function Toggle({ value, onChange, label, disabled }: ToggleProps) {
  const t = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    t.set(withSpring(value ? 1 : 0, motion.spring));
  }, [value, t]);

  const track = useAnimatedStyle(() => ({
    borderColor: interpolateColor(t.value, [0, 1], ['rgba(255,255,255,0.3)', '#FFFFFF']),
  }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * (W - KNOB - 8) }],
    backgroundColor: interpolateColor(t.value, [0, 1], ['rgba(255,255,255,0.45)', '#FFFFFF']),
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={12}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(!value);
      }}
      style={{ opacity: disabled ? 0.4 : 1 }}>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: W,
    height: H,
    borderRadius: H / 2,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 2.5,
    backgroundColor: colors.bg,
  },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
});
