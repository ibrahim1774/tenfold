import * as Haptics from 'expo-haptics';
import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { clampPlacement, type Placement } from './frame';

type Props = {
  /** On-screen canvas size (points). */
  width: number;
  height: number;
  /** Source video display size (any units; only the proportions matter). */
  videoW: number;
  videoH: number;
  /** Placement the native preview is currently showing. */
  placement: Placement;
  /** Increments whenever the native preview has rendered a new document; the live transform then resets. */
  renderTick: number;
  onCommit: (p: Placement) => void;
  onTap: () => void;
  onDoubleTap: () => void;
  children: ReactNode;
};

const SNAP = 0.015; // offsets this close to centre snap to it

/**
 * The output canvas. Pinch zooms and drag moves the video on it, CapCut-style. While the fingers are
 * down, the already-rendered preview is transformed on the UI thread (exactly, since the preview is the
 * canvas); on release the placement is committed and the engine re-renders it for real.
 */
export function FrameCanvas({ width, height, videoW, videoH, placement, renderTick, onCommit, onTap, onDoubleTap, children }: Props) {
  // What the native preview shows (base) and where the fingers have taken it (live).
  const base = useSharedValue(placement);
  const live = useSharedValue(placement);
  const start = useSharedValue(placement);
  const snapped = useSharedValue(false);

  // A new render has landed: it already contains the current placement, so drop the live transform.
  // Keyed on the render only: between a commit and its render, the old frame is still on screen and the
  // live transform must keep describing the change relative to it.
  const latest = useRef(placement);
  useEffect(() => {
    latest.current = placement;
  });
  useEffect(() => {
    base.set(latest.current);
    live.set(latest.current);
  }, [renderTick, base, live]);

  const tick = () => Haptics.selectionAsync();

  const pinch = Gesture.Pinch()
    .onStart(() => {
      start.set(live.get());
    })
    .onUpdate((e) => {
      const s = start.get();
      live.set(clampPlacement({ ...live.get(), scale: s.scale * e.scale }, width, height, videoW, videoH));
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .averageTouches(true)
    .onStart(() => {
      start.set(live.get());
      snapped.set(false);
    })
    .onUpdate((e) => {
      const s = start.get();
      let ox = s.offsetX + e.translationX / width;
      let oy = s.offsetY + e.translationY / height;
      const nearCentre = Math.abs(ox) < SNAP && Math.abs(oy) < SNAP;
      if (Math.abs(ox) < SNAP) ox = 0;
      if (Math.abs(oy) < SNAP) oy = 0;
      if (nearCentre && !snapped.get()) scheduleOnRN(tick);
      snapped.set(nearCentre);
      live.set(clampPlacement({ scale: live.get().scale, offsetX: ox, offsetY: oy }, width, height, videoW, videoH));
    });

  // Commit when a finger lifts. Pinch and pan can both end; the editor ignores a repeat of the same placement.
  const commit = () => {
    'worklet';
    const p = live.get();
    const b = base.get();
    if (p.scale !== b.scale || p.offsetX !== b.offsetX || p.offsetY !== b.offsetY) scheduleOnRN(onCommit, p);
  };
  pinch.onEnd(commit);
  pan.onEnd(commit);
  const adjust = Gesture.Simultaneous(pinch, pan);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e, success) => {
      if (success) scheduleOnRN(onDoubleTap);
    });
  const singleTap = Gesture.Tap().onEnd((_e, success) => {
    if (success) scheduleOnRN(onTap);
  });
  const taps = Gesture.Exclusive(doubleTap, singleTap);

  const gesture = Gesture.Race(adjust, taps);

  // Map the base render to the live placement: scale k about the video centre, then move the centre.
  const style = useAnimatedStyle(() => {
    const b = base.get();
    const l = live.get();
    const k = l.scale / b.scale;
    return {
      transform: [
        { translateX: l.offsetX * width - k * b.offsetX * width },
        { translateY: l.offsetY * height - k * b.offsetY * height },
        { scale: k },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.canvas, { width, height }]} collapsable={false}>
        <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  canvas: { overflow: 'hidden', backgroundColor: '#000000' },
});
