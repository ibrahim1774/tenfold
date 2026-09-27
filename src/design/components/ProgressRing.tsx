import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { gradients, motion } from '../tokens';
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
        <Defs>
          <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            {gradients.cta.map((color, i) => (
              <Stop key={color} offset={i / (gradients.cta.length - 1)} stopColor={color} />
            ))}
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring)"
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
