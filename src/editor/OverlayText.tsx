import { StyleSheet, Text, View, type LayoutChangeEvent, type TextStyle } from 'react-native';

import type { TextOverlay } from '@/engine/types';
import { overlayMetrics } from './textLayout';

// Outline: the text drawn in the stroke colour at eight offsets under the fill (RN Text has no stroke).
const RING = [
  [1, 0],
  [0.7071, 0.7071],
  [0, 1],
  [-0.7071, 0.7071],
  [-1, 0],
  [-0.7071, -0.7071],
  [0, -1],
  [0.7071, -0.7071],
];

type Props = {
  overlay: TextOverlay;
  /** Canvas size in points: every size is a fraction of it, as in the engine. */
  canvasW: number;
  canvasH: number;
  onLayout?: (e: LayoutChangeEvent) => void;
};

/**
 * One text overlay drawn the way the engine draws it (TextOverlayLayerBuilder): same font, size, line
 * height, wrap width, padding, box and outline, from src/editor/textLayout.ts. Unrotated; the caller
 * positions and rotates it.
 */
export function OverlayText({ overlay, canvasW, canvasH, onLayout }: Props) {
  const m = overlayMetrics(overlay, canvasW, canvasH);
  const text: TextStyle = {
    fontFamily: m.family,
    fontSize: m.fontSize,
    lineHeight: m.lineHeight,
    textAlign: overlay.align,
    maxWidth: m.maxTextWidth,
  };
  const glow: TextStyle | null = m.glow ? { textShadowColor: m.glow.color, textShadowRadius: m.glow.radius, textShadowOffset: { width: 0, height: 0 } } : null;
  return (
    <View
      onLayout={onLayout}
      style={{ paddingHorizontal: m.padX, paddingVertical: m.padY, backgroundColor: m.boxColor, borderRadius: m.radius, borderCurve: 'continuous' }}>
      <View>
        {m.stroke &&
          RING.map(([dx, dy], i) => (
            <Text
              key={i}
              allowFontScaling={false}
              style={[text, styles.copy, { color: m.stroke!.color, transform: [{ translateX: dx * m.stroke!.width }, { translateY: dy * m.stroke!.width }] }]}>
              {overlay.text}
            </Text>
          ))}
        {/* Neon: a second, softer glow pass under the text for intensity (the engine draws two too). */}
        {glow && (
          <Text allowFontScaling={false} style={[text, glow, styles.copy, { color: m.textColor, opacity: 0.5 }]}>
            {overlay.text}
          </Text>
        )}
        <Text allowFontScaling={false} style={[text, glow, { color: m.textColor }]}>
          {overlay.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
