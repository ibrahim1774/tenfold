import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '../theme';
import { motion } from '../tokens';

/** Thin progress bar; slides to each new value instead of jumping. */
export function ProgressBar({ progress, height = 6 }: { progress: number; height?: number }) {
  const colors = useTheme();
  const p = useSharedValue(Math.max(0, Math.min(1, progress)));
  useEffect(() => {
    p.set(withTiming(Math.max(0, Math.min(1, progress)), { duration: motion.base, easing: Easing.out(Easing.cubic) }));
  }, [progress, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: colors.track }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      <Animated.View style={[{ height, borderRadius: height / 2, overflow: 'hidden' }, fill]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
  },
});
