// Manual framing math. Mirrors modules/tenfold-engine/ios/Engine/Core/Framing.swift exactly, so the
// live pinch preview lands where the rendered video will be. Tested with the same numbers as CoreTests.

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;

/** Pixel scale that shows the whole video on the canvas (Fit). */
export function fitScale(canvasW: number, canvasH: number, videoW: number, videoH: number) {
  if (!(videoW > 0 && videoH > 0)) return 1;
  return Math.min(canvasW / videoW, canvasH / videoH);
}

/** User scale (1 = Fit) that covers the whole canvas (Fill). */
export function fillUserScale(canvasW: number, canvasH: number, videoW: number, videoH: number) {
  if (!(videoW > 0 && videoH > 0)) return 1;
  return Math.max(canvasW / videoW, canvasH / videoH) / fitScale(canvasW, canvasH, videoW, videoH);
}

export function clampScale(s: number) {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Centre stays on the canvas; a video bigger than the canvas can pan until its edge reaches the centre. */
export function maxOffset(videoSize: number, canvasSize: number) {
  'worklet';
  if (!(canvasSize > 0)) return 0.5;
  return Math.max(0.5, videoSize / canvasSize / 2);
}

export type Placement = { scale: number; offsetX: number; offsetY: number };

/** Clamps a placement for a canvas (any units) and a video (its display size in the same proportions). */
export function clampPlacement(p: Placement, canvasW: number, canvasH: number, videoW: number, videoH: number): Placement {
  'worklet';
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale));
  const fit = videoW > 0 && videoH > 0 ? Math.min(canvasW / videoW, canvasH / videoH) : 1;
  const px = fit * scale;
  const mx = Math.max(0.5, (videoW * px) / canvasW / 2);
  const my = Math.max(0.5, (videoH * px) / canvasH / 2);
  return {
    scale,
    offsetX: Math.min(mx, Math.max(-mx, p.offsetX)),
    offsetY: Math.min(my, Math.max(-my, p.offsetY)),
  };
}
