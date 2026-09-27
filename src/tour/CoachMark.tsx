import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect as SvgRect } from 'react-native-svg';

import { AppText, GradientButton } from '@/design/components';
import { colors, motion, radii, spacing } from '@/design/tokens';

import type { Rect } from './steps';

const PAD = 6;
const RADIUS = radii.card;
const CARD_GAP = 14;

function roundedRect({ x, y, width: w, height: h }: Rect, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  return `M${x + rr},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x + rr} A${rr},${rr} 0 0 1 ${x},${y + h - rr} V${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y} Z`;
}

export type CoachMarkProps = {
  target: Rect;
  title: string;
  body: string;
  index: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
};

/** Dims the screen except for a rounded cut-out around `target`, with a card that explains it. */
export function CoachMark({ target, title, body, index, total, onNext, onSkip }: CoachMarkProps) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const last = index === total - 1;

  // Keep the cut-out on screen, with a little air around the control.
  const x = Math.max(4, target.x - PAD);
  const y = Math.max(insets.top, target.y - PAD);
  const hole: Rect = {
    x,
    y,
    width: Math.min(win.width - 4, target.x + target.width + PAD) - x,
    height: Math.min(win.height - insets.bottom, target.y + target.height + PAD) - y,
  };

  // Card below the highlight when there's room, otherwise above it.
  const spaceBelow = win.height - insets.bottom - (hole.y + hole.height);
  const below = spaceBelow > 220 || hole.y < win.height / 2;
  const cardPos = below
    ? { top: Math.min(hole.y + hole.height + CARD_GAP, win.height - insets.bottom - 200) }
    : { bottom: Math.max(win.height - hole.y + CARD_GAP, insets.bottom + spacing.lg) };

  const d = `M0,0 H${win.width} V${win.height} H0 Z ${roundedRect(hole, RADIUS)}`;

  return (
    <Animated.View
      entering={FadeIn.duration(motion.fast)}
      exiting={FadeOut.duration(motion.fast)}
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal>
      {/* Swallows taps outside the card: the tour asks for Next or Skip. */}
      <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => {}}>
        <Svg width={win.width} height={win.height}>
          <Path d={d} fill={colors.overlay} fillRule="evenodd" />
          <SvgRect
            x={hole.x}
            y={hole.y}
            width={hole.width}
            height={hole.height}
            rx={RADIUS}
            ry={RADIUS}
            fill="none"
            stroke={colors.accent}
            strokeWidth={1.5}
          />
        </Svg>
      </Pressable>

      <Animated.View layout={LinearTransition.duration(motion.base)} style={[styles.card, cardPos]}>
        <View style={styles.head}>
          <AppText variant="title" style={styles.flex} accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} tabular accessibilityLabel={`Step ${index + 1} of ${total}`}>
            {index + 1}/{total}
          </AppText>
        </View>
        <AppText variant="body" color={colors.textSecondary}>
          {body}
        </AppText>
        <View style={styles.actions}>
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
            hitSlop={4}>
            <AppText variant="chip" color={colors.textSecondary}>
              Skip tour
            </AppText>
          </Pressable>
          <GradientButton title={last ? 'Got it' : 'Next'} height={44} shape="pill" onPress={onNext} style={styles.next} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    position: 'absolute',
    left: spacing.gutter,
    right: spacing.gutter,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.cardHigh,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  skip: { minHeight: 44, justifyContent: 'center', paddingRight: spacing.md },
  next: { minWidth: 104 },
  pressed: { opacity: 0.6 },
});
