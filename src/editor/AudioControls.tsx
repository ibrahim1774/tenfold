import { SymbolView } from 'expo-symbols';
import { Fragment, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText, IconButton, PressableScale } from '@/design/components';
import type { SFSymbol } from '@/design/symbols';
import { colors, radii, spacing } from '@/design/tokens';

const THUMB = 26;

/**
 * Volume 0–200% on a track (100% marked). The number follows the finger; the edit is committed once, on
 * release, so a drag is one undo step. Keyed by the saved value, so undo resets it.
 */
export function LevelSlider({ value, max = 2, step = 0.05, label, onCommit }: { value: number; max?: number; step?: number; label: string; onCommit: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const [live, setLive] = useState(value);
  const x = useSharedValue(0);
  const w = Math.max(1, width - THUMB);
  const snap = (v: number) => Math.min(max, Math.max(0, Math.round(v / step) * step));
  // The thumb sits at the saved value until the finger moves it.
  const place = (v: number) => (v / max) * w;

  const fromX = (px: number) => {
    'worklet';
    const v = (Math.min(w, Math.max(0, px)) / w) * max;
    return Math.min(max, Math.max(0, Math.round(v / step) * step));
  };
  const pan = Gesture.Pan()
    .hitSlop({ vertical: 12 })
    .onBegin((e) => {
      x.set(Math.min(w, Math.max(0, e.x - THUMB / 2)));
      scheduleOnRN(setLive, fromX(e.x - THUMB / 2));
    })
    .onUpdate((e) => {
      x.set(Math.min(w, Math.max(0, e.x - THUMB / 2)));
      scheduleOnRN(setLive, fromX(e.x - THUMB / 2));
    })
    .onFinalize(() => {
      scheduleOnRN(onCommit, fromX(x.get()));
    });

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const fill = useAnimatedStyle(() => ({ width: x.get() }));
  const pct = Math.round(live * 100);

  return (
    <View style={styles.sliderRow}>
      <View
        style={styles.track}
        onLayout={(e) => {
          const nw = e.nativeEvent.layout.width;
          setWidth(nw);
          x.set((value / max) * Math.max(1, nw - THUMB));
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: `${Math.round(value * 100)}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = snap(value + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1));
          setLive(next);
          x.set(place(next));
          onCommit(next);
        }}>
        <GestureDetector gesture={pan}>
          <View style={styles.hit}>
            <View style={styles.rail} />
            <Animated.View style={[styles.railFill, fill]} />
            {width > 0 && <View style={[styles.mark, { left: place(1) + THUMB / 2 - 1 }]} />}
            <Animated.View style={[styles.thumb, thumb]} />
          </View>
        </GestureDetector>
      </View>
      <AppText variant="chip" tabular style={styles.value}>
        {`${pct}%`}
      </AppText>
    </View>
  );
}

/** − value + for a number in fixed steps (fade lengths). */
export function Stepper({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))}>
      <AppText variant="body" style={styles.stepLabel}>
        {label}
      </AppText>
      <IconButton icon="minus" label={`Shorter ${label.toLowerCase()}`} size={44} tone="filled" iconScale={0.36} disabled={value <= min + 1e-9} onPress={() => onChange(Math.max(min, value - step))} />
      <AppText variant="chip" tabular style={styles.stepValue}>
        {format(value)}
      </AppText>
      <IconButton icon="plus" label={`Longer ${label.toLowerCase()}`} size={44} tone="filled" iconScale={0.36} disabled={value >= max - 1e-9} onPress={() => onChange(Math.min(max, value + step))} />
    </View>
  );
}

export type ActionRow = { id: string; icon: SFSymbol; title: string; onPress: () => void; busy?: boolean; disabled?: boolean };

/** Grouped inset rows (iOS Settings) that each start something: an icon, a title, a chevron. */
export function ActionRows({ rows }: { rows: ActionRow[] }) {
  return (
    <View style={styles.group}>
      {rows.map((r, i) => (
        <Fragment key={r.id}>
          {i > 0 && <View style={styles.divider} />}
          <PressableScale
            haptic={false}
            scaleTo={0.99}
            disabled={r.disabled || r.busy}
            onPress={r.onPress}
            accessibilityRole="button"
            accessibilityLabel={r.title}
            accessibilityState={{ disabled: r.disabled, busy: r.busy }}
            style={[styles.row, r.disabled && styles.rowOff]}>
            <SymbolView name={r.icon} size={18} weight="regular" tintColor={colors.textPrimary} />
            <AppText variant="body" style={styles.rowTitle}>
              {r.title}
            </AppText>
            {r.busy ? <ActivityIndicator color={colors.textSecondary} /> : <SymbolView name="chevron.right" size={13} tintColor={colors.textMuted} />}
          </PressableScale>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.cardHigh, borderRadius: radii.tile, borderCurve: 'continuous', overflow: 'hidden' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  rowOff: { opacity: 0.5 },
  rowTitle: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg + 30, backgroundColor: colors.separator },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 44, justifyContent: 'center' },
  hit: { height: 44, justifyContent: 'center' },
  rail: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 4, borderRadius: 2, backgroundColor: colors.cardHigh },
  railFill: { position: 'absolute', left: THUMB / 2, height: 4, borderRadius: 2, backgroundColor: colors.textPrimary },
  mark: { position: 'absolute', top: 16, width: 2, height: 12, borderRadius: 1, backgroundColor: colors.borderStrong },
  thumb: { position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.textPrimary },
  value: { width: 52, textAlign: 'right' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepLabel: { flex: 1 },
  stepValue: { width: 56, textAlign: 'center' },
});
