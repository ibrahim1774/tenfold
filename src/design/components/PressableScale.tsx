import * as Haptics from 'expo-haptics';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useEffect, useRef } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { motion } from '../tokens';

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** 'impact' for actions (default), 'selection' for choices like chips and segments, false for none. */
  haptic?: boolean | 'impact' | 'selection';
  scaleTo?: number;
  /** Pass the control's selected state: it swells and bounces back once each time this turns true. */
  pop?: boolean;
};

/**
 * Pressable that sinks while held and springs back with a small bounce on release, like an iOS control.
 * Haptics are opt-in (docs/DESIGN.md §7). Reduce Motion turns the springs into plain changes.
 */
export function PressableScale({
  style,
  haptic = false,
  scaleTo = motion.pressScale,
  onPressIn,
  onPressOut,
  onPress,
  pop,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const was = useRef(pop);
  useEffect(() => {
    if (pop && !was.current) scale.set(withSequence(withTiming(motion.popScale, { duration: 90 }), withSpring(1, motion.bounce)));
    was.current = pop;
  }, [pop, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        scale.set(withTiming(scaleTo, { duration: 90 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, motion.bounce));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic === 'selection') Haptics.selectionAsync();
        else if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}>
      {(state) => (
        <Animated.View style={[style, animated]}>
          {typeof children === 'function' ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
