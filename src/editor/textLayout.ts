// Text overlay geometry and looks, mirrored from the engine (TextOverlayMetrics in
// modules/tenfold-engine/ios/Engine/Core/TextOverlays.swift and TextOverlayLayerBuilder.swift).
// The canvas draws with RN Text from these numbers; the export draws with CoreText from the Swift copy.
// Change both together; tests/queue/textOverlays.ts and CoreTests check the same cases.

import type { TextOverlay, TextOverlayBox, TextOverlayStyle } from '@/engine/types';

export const DEFAULT_SIZE = 0.07;
export const MIN_SIZE = 0.03;
export const MAX_SIZE = 0.2;
/** Line height as a multiple of the font size. */
export const LINE_HEIGHT = 1.25;
/** Box padding in ems. */
export const PAD_X = 0.3;
export const PAD_Y = 0.15;
/** Lines wrap at this fraction of the canvas width. */
export const WRAP = 0.84;
/** Outline width in pixels on a 1080-short-side frame. */
export const STROKE_PER_1080 = 6;
export const CORNER_RATIO = 0.25;
export const TRANSLUCENT_ALPHA = 0.55;
export const LIGHT_THRESHOLD = 0.6;
/** Neon glow radius in ems. */
export const GLOW = 0.25;

export type StyleDef = { id: TextOverlayStyle; name: string; family: string; color: string };

/** TikTok's text styles, approximated with fonts we can ship (PostScript names). */
export const TEXT_STYLES: StyleDef[] = [
  { id: 'classic', name: 'Classic', family: 'TikTokSans-ExtraBold', color: '#FFFFFF' },
  { id: 'elegance', name: 'Elegance', family: 'Didot', color: '#E6E6E6' },
  { id: 'neon', name: 'Neon', family: 'BebasNeue-Regular', color: '#FF4FD8' },
  // Bodoni 72 has no bold italic on iOS 26; the upright bold is the closest real face.
  { id: 'retro', name: 'Retro', family: 'BodoniSvtyTwoITCTT-Bold', color: '#FFF3D6' },
  { id: 'comic', name: 'Comic Sans', family: 'ComicNeue-Bold', color: '#FFFFFF' },
  { id: 'typewriter', name: 'Typewriter', family: 'AmericanTypewriter-Bold', color: '#FFFFFF' },
  { id: 'handwriting', name: 'Handwriting', family: 'Noteworthy-Bold', color: '#FFFFFF' },
  { id: 'serif', name: 'Serif', family: 'Georgia-Bold', color: '#FFFFFF' },
  { id: 'bold', name: 'Bold', family: 'Inter-Black', color: '#FFFFFF' },
];

export const styleDef = (id: TextOverlayStyle) => TEXT_STYLES.find((s) => s.id === id) ?? TEXT_STYLES[0];

export const BOX_ORDER: TextOverlayBox[] = ['none', 'filled', 'translucent', 'outline'];
export const nextBox = (b: TextOverlayBox) => BOX_ORDER[(BOX_ORDER.indexOf(b) + 1) % BOX_ORDER.length];

export const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#30D5C8', '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF4FD8', '#FFF3D6', '#E6E6E6', '#8E8E93',
];

export const HOOKS = ['POV:', 'Day 1', 'How to', 'Wait for it'];

/** Also runs on the UI thread (TextCanvas's animated style), so it must stay a worklet. */
export function clampSize(s: number): number {
  'worklet';
  return Number.isFinite(s) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, s)) : DEFAULT_SIZE;
}

export function rgb(hex: string): [number, number, number] | null {
  let h = hex.trim();
  if (!h.startsWith('#')) return null;
  h = h.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const v = parseInt(h, 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

/** Rec. 709 luma of the gamma-encoded colour (white = 1). Unparseable colours count as white. */
export function luminance(hex: string) {
  const c = rgb(hex);
  if (!c) return 1;
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export const isLight = (hex: string) => luminance(hex) > LIGHT_THRESHOLD;
/** Text on a filled or translucent box: black on light colours, white on dark ones. */
export const contrastText = (hex: string) => (isLight(hex) ? '#000000' : '#FFFFFF');

/** "#RRGGBB" + alpha → rgba(). */
export function withAlpha(hex: string, a: number) {
  const c = rgb(hex) ?? [1, 1, 1];
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}

/**
 * Keeps the rotated text box inside the canvas. `x`, `y`: box centre as fractions; box and canvas in the
 * same units. The box's axis-aligned extent after rotation θ is (w|cos θ| + h|sin θ|, w|sin θ| + h|cos θ|);
 * the centre is clamped to [extent/2, canvas − extent/2] on each axis, or to the middle when the box is
 * bigger than the canvas. Same formula as TextOverlayMetrics.clampCenter.
 */
export function clampCenter(x: number, y: number, boxW: number, boxH: number, rotation: number, canvasW: number, canvasH: number) {
  if (!(canvasW > 0 && canvasH > 0)) return { x, y };
  const theta = (rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  const halfW = (boxW * c + boxH * s) / 2;
  const halfH = (boxW * s + boxH * c) / 2;
  const axis = (f: number, half: number, size: number) => {
    const lo = half;
    const hi = size - half;
    if (lo > hi) return 0.5;
    const p = (Number.isFinite(f) ? f : 0.5) * size;
    return Math.min(hi, Math.max(lo, p)) / size;
  };
  return { x: axis(x, halfW, canvasW), y: axis(y, halfH, canvasH) };
}

/** When the overlay shows, in output seconds, clipped to the video. */
export function overlayWindow(o: Pick<TextOverlay, 'start' | 'end'>, total: number) {
  const start = Math.max(0, Math.min(total, o.start ?? 0));
  const end = Math.max(start, Math.min(total, o.end ?? total));
  return { start, end };
}

/** Everything the canvas needs to draw one overlay at a canvas size (points). */
export function overlayMetrics(o: TextOverlay, canvasW: number, canvasH: number) {
  const unit = Math.min(canvasW, canvasH);
  const fontSize = clampSize(o.size) * unit;
  const lineHeight = fontSize * LINE_HEIGHT;
  const boxed = o.box === 'filled' || o.box === 'translucent';
  return {
    fontSize,
    lineHeight,
    padX: fontSize * PAD_X,
    padY: fontSize * PAD_Y,
    maxTextWidth: canvasW * WRAP,
    radius: lineHeight * CORNER_RATIO,
    family: styleDef(o.style).family,
    textColor: boxed ? contrastText(o.color) : o.color,
    boxColor: o.box === 'filled' ? o.color : o.box === 'translucent' ? withAlpha(o.color, TRANSLUCENT_ALPHA) : undefined,
    stroke: o.box === 'outline' ? { color: isLight(o.color) ? '#000000' : '#FFFFFF', width: (STROKE_PER_1080 * unit) / 1080 } : undefined,
    glow: o.style === 'neon' ? { color: o.color, radius: fontSize * GLOW } : undefined,
  };
}
