import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { dark } from '@/design/tokens';
import type { TextOverlay } from '@/engine/types';
import { OverlayText } from './OverlayText';
import { clampCenter, clampSize, overlayWindow } from './textLayout';

export type OverlayPatch = Pick<TextOverlay, 'x' | 'y' | 'size' | 'rotation'>;

type Props = {
  overlays: TextOverlay[];
  /** On-screen canvas size (points), the same shape as the output. */
  width: number;
  height: number;
  /** Playhead (output seconds) and video length: overlays show only inside their window. */
  time: number;
  total: number;
  selectedId: string | null;
  /** A finger went down on an overlay (select it, pause playback). */
  onGrab: (id: string) => void;
  /** Tapped: open the text editor for it. */
  onOpen: (id: string) => void;
  /** Moved, scaled or rotated. True if the document changed. */
  onCommit: (id: string, patch: OverlayPatch) => boolean;
  /** Dropped on the trash zone. */
  onDelete: (id: string) => void;
};

/** Centre below this fraction of the canvas height = over the trash zone. */
const TRASH_AT = 0.86;

/**
 * Text overlays on the output canvas, drawn with RN Text from the engine's own layout numbers
 * (src/editor/textLayout.ts) so they sit where the export puts them. Drag to move, pinch to scale,
 * twist to rotate, tap to edit, drag to the bottom edge to delete.
 */
export function TextCanvas({ overlays, width, height, time, total, selectedId, onGrab, onOpen, onCommit, onDelete }: Props) {
  // 0 hidden, 1 shown (dragging), 2 armed (the text is over it).
  const trash = useSharedValue(0);
  // Measured box sizes, kept here so a committed move (which remounts the item) doesn't blank it for a frame.
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const measure = (id: string, b: Box) =>
    setBoxes((all) => (all[id] && Math.abs(all[id].w - b.w) < 0.5 && Math.abs(all[id].h - b.h) < 0.5 ? all : { ...all, [id]: b }));
  const trashStyle = useAnimatedStyle(() => ({
    opacity: trash.get() > 0 ? 1 : 0,
    transform: [{ scale: trash.get() > 1 ? 1.15 : 1 }],
    backgroundColor: trash.get() > 1 ? dark.danger : 'rgba(0,0,0,0.6)',
  }));

  const shown = overlays.filter((o) => {
    if (o.id === selectedId) return true;
    const w = overlayWindow(o, total);
    return time >= w.start && time <= w.end;
  });

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="box-none">
      {shown.map((o) => (
        <OverlayItem
          // A committed change mounts a fresh item, so the live transform never outlives its gesture.
          key={`${o.id}:${o.x}:${o.y}:${o.size}:${o.rotation}`}
          overlay={o}
          box={boxes[o.id] ?? null}
          onMeasure={measure}
          width={width}
          height={height}
          selected={o.id === selectedId}
          trash={trash}
          onGrab={onGrab}
          onOpen={onOpen}
          onCommit={onCommit}
          onDelete={onDelete}
        />
      ))}
      <Animated.View pointerEvents="none" style={[styles.trash, trashStyle]} accessibilityElementsHidden>
        <SymbolView name="trash" size={22} tintColor={dark.textPrimary} />
      </Animated.View>
    </View>
  );
}

type Box = { w: number; h: number };

type ItemProps = {
  overlay: TextOverlay;
  box: Box | null;
  onMeasure: (id: string, box: Box) => void;
  width: number;
  height: number;
  selected: boolean;
  trash: SharedValue<number>;
  onGrab: (id: string) => void;
  onOpen: (id: string) => void;
  onCommit: (id: string, patch: OverlayPatch) => boolean;
  onDelete: (id: string) => void;
};

function OverlayItem({ overlay: o, box, onMeasure, width, height, selected, trash, onGrab, onOpen, onCommit, onDelete }: ItemProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const turn = useSharedValue(0);
  const active = useSharedValue(0);

  // Where the engine puts the box centre (same clamp as TextOverlayMetrics.clampCenter).
  const c = box ? clampCenter(o.x, o.y, box.w, box.h, o.rotation, width, height) : { x: o.x, y: o.y };
  const cx = c.x * width;
  const cy = c.y * height;
  const bw = box?.w ?? 0;
  const bh = box?.h ?? 0;

  const reset = () => {
    tx.set(0);
    ty.set(0);
    scale.set(1);
    turn.set(0);
  };

  const finish = (dx: number, dy: number, k: number, deg: number, drop: boolean) => {
    if (drop) {
      onDelete(o.id);
      return;
    }
    const size = clampSize(o.size * k);
    const f = size / o.size;
    let rotation = (((o.rotation + deg) % 360) + 360) % 360;
    if (rotation > 180) rotation -= 360;
    // Snap near-straight text straight.
    if (Math.abs(rotation) < 3) rotation = 0;
    const p = clampCenter((cx + dx) / width, (cy + dy) / height, bw * f, bh * f, rotation, width, height);
    const round = (v: number) => Math.round(v * 10000) / 10000;
    const changed = onCommit(o.id, { x: round(p.x), y: round(p.y), size: round(size), rotation: round(rotation) });
    if (!changed) reset();
  };

  const begin = () => {
    'worklet';
    active.set(active.get() + 1);
    if (active.get() === 1) scheduleOnRN(onGrab, o.id);
  };
  const end = () => {
    'worklet';
    active.set(Math.max(0, active.get() - 1));
    if (active.get() > 0) return;
    const drop = trash.get() > 1;
    trash.set(0);
    const k = scale.get();
    scheduleOnRN(finish, tx.get(), ty.get(), k, turn.get(), drop);
  };

  const pan = Gesture.Pan()
    .maxPointers(2)
    .averageTouches(true)
    .hitSlop(12)
    .onStart(begin)
    .onUpdate((e) => {
      tx.set(e.translationX);
      ty.set(e.translationY);
      const over = (cy + e.translationY) / height > TRASH_AT;
      trash.set(over ? 2 : 1);
    })
    .onEnd(end);
  const pinch = Gesture.Pinch()
    .onStart(begin)
    .onUpdate((e) => {
      scale.set(e.scale);
    })
    .onEnd(end);
  const rotate = Gesture.Rotation()
    .onStart(begin)
    .onUpdate((e) => {
      turn.set((e.rotation * 180) / Math.PI);
    })
    .onEnd(end);
  const tap = Gesture.Tap()
    .hitSlop(12)
    .onEnd((_e, success) => {
      if (success) scheduleOnRN(onOpen, o.id);
    });
  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch, rotate), tap);

  // Placed by translation from the canvas origin (not left/top), so the text always has the full canvas
  // width to wrap in, like the engine: only the 84% wrap width limits it.
  const baseX = cx - bw / 2;
  const baseY = cy - bh / 2;
  const live = useAnimatedStyle(() => {
    const k = clampSize(o.size * scale.get()) / o.size;
    return {
      transform: [
        { translateX: baseX + tx.get() },
        { translateY: baseY + ty.get() },
        { rotate: `${o.rotation + turn.get()}deg` },
        { scale: k },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Text: ${o.text}`}
        accessibilityHint="Edits the text. Drag to move, pinch to resize."
        style={[styles.item, { opacity: box ? 1 : 0 }, live]}>
        <OverlayText overlay={o} canvasW={width} canvasH={height} onLayout={(e) => onMeasure(o.id, { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} />
        {selected && <View pointerEvents="none" style={styles.selected} />}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  item: { position: 'absolute', left: 0, top: 0 },
  selected: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderWidth: 1.5, borderColor: '#FFFFFF', borderRadius: 6 },
  trash: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
