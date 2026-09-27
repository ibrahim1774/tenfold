import * as Haptics from 'expo-haptics';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { motion } from '../tokens';

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** 'impact' for actions (default), 'selection' for choices like chips and segments, false for none. */
  haptic?: boolean | 'impact' | 'selection';
  scaleTo?: number;
};

/** Pressable that eases to 0.97 while held. Haptics are opt-in (docs/DESIGN.md §7). */
export function PressableScale({
  style,
  haptic = false,
  scaleTo = motion.pressScale,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, motion.spring));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, motion.spring));
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
