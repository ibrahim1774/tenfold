import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '../theme';
import { motion } from '../tokens';
import { AppText } from './AppText';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingProps = {
  progress: number; // 0..1
  size?: number;
  stroke?: number;
  label?: string;
  showLabel?: boolean;
};

export function ProgressRing({ progress, size = 120, stroke = 10, label, showLabel = true }: ProgressRingProps) {
  const colors = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(0);

  useEffect(() => {
    p.set(withSpring(Math.max(0, Math.min(1, progress)), motion.spring));
  }, [progress, p]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          animatedProps={animatedProps}
        />
      </Svg>
      {showLabel && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <AppText variant={size >= 100 ? 'title' : 'caption'} tabular>{label ?? `${Math.round(progress * 100)}%`}</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
