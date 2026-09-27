// Design tokens: dark "cinematic" theme (docs/SPEC.md §5.1, reference docs/design-reference-v2.png).

/**
 * "Graphite": flat near-black surfaces, white type, one accent used sparingly. The footage is the
 * only colour on screen. (The earlier purple-glow theme lives in git history; swapping this block
 * back restores it.)
 */
export const colors = {
  // Surfaces: black canvas, two steps of elevation.
  bg: '#000000',
  bgRaised: '#0C0C0E',
  card: '#141416',
  cardHigh: '#1E1E21',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  overlay: 'rgba(0,0,0,0.72)',

  // Legacy names for the old ambient glow (now flat).
  glowPlum: 'rgba(0,0,0,0)',
  glowViolet: 'rgba(0,0,0,0)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#9C9CA3',
  textMuted: '#6B6B72',
  textInverse: '#000000',

  // The one accent: progress, selection, the playhead, links.
  accent: '#FFB020',
  accentSoft: 'rgba(255,176,32,0.16)',
  /** Text for in-place actions and small accents (links, "Pro"). */
  accentText: '#FFB020',
  // Legacy names, mapped onto the accent.
  violet: '#FFB020',
  violetSoft: 'rgba(255,176,32,0.16)',
  orange: '#FFB020',
  danger: '#FF453A',
  dangerSoft: 'rgba(255,69,58,0.16)',
  success: '#30D158',
  heart: '#FF453A',

  // Controls
  chipFill: '#1E1E21',
  chipText: '#FFFFFF',
  chipSelectedFill: '#FFFFFF',
  chipSelectedText: '#000000',
  ruler: '#6B6B72',
  waveform: '#8E8E95',
} as const;

/** Solid colours now; the names stay so progress bars and rings keep working. */
export const gradients = {
  cta: ['#FFFFFF', '#FFFFFF'] as const,
  progress: ['#FFB020', '#FFB020'] as const,
  glow: ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'] as const,
};

export const radii = {
  card: 14,
  tile: 12,
  chip: 18,
  button: 12,
  thumb: 10,
  round: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  gutter: 20,
} as const;

/**
 * Interface text is the iPhone's own font (SF Pro): `fontFamily` undefined + a weight. Poppins and the
 * other bundled faces are for captions only (src/captions/presets.ts).
 */
export const fonts = {
  regular: undefined,
  medium: undefined,
  semiBold: undefined,
  bold: undefined,
} as const;

export const weights = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
} as const;

/**
 * Six sizes, no more (docs/DESIGN.md): 30 screen titles · 20 section/sheet titles · 15 body ·
 * 14 controls · 13 secondary · 12 small print. Legacy names map onto them.
 */
export const type = {
  display: { fontWeight: weights.bold, fontSize: 30, lineHeight: 36, letterSpacing: 0.2 },
  title: { fontWeight: weights.semiBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  body: { fontWeight: weights.regular, fontSize: 15, lineHeight: 20 },
  bodyStrong: { fontWeight: weights.semiBold, fontSize: 15, lineHeight: 20 },
  chip: { fontWeight: weights.medium, fontSize: 14, lineHeight: 18 },
  label: { fontWeight: weights.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontWeight: weights.regular, fontSize: 12, lineHeight: 16 },
  // Legacy aliases (same sizes as above).
  hero: { fontWeight: weights.bold, fontSize: 30, lineHeight: 36, letterSpacing: 0.2 },
  section: { fontWeight: weights.semiBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  cta: { fontWeight: weights.semiBold, fontSize: 15, lineHeight: 20 },
} as const;

export const sizes = {
  chipHeight: 36,
  ctaHeight: 52,
  iconButton: 44,
  tabBarHeight: 50,
} as const;

/**
 * Motion explains a change; it never decorates (docs/DESIGN.md). Critically damped springs (no bounce),
 * short ease-out timings, and no entrance animations on screens or lists.
 */
export const motion = {
  spring: { damping: 30, stiffness: 320, overshootClamping: true },
  pressScale: 0.97,
  fast: 160,
  base: 240,
} as const;

// Mock thumbnail palettes (M0 only; real thumbnails come from the engine in M1).
export const thumbGradients = [
  ['#2B1A12', '#C2531D', '#FFB347'],
  ['#0D0F1F', '#3A1B4F', '#FF2E4D'],
  ['#0E1418', '#1F3340', '#6D8A96'],
  ['#1A0B24', '#8E2DE2', '#FF4FD8'],
  ['#101820', '#2E4A62', '#F2A65A'],
  ['#1B0F0A', '#6B2E1F', '#E0703B'],
  ['#0B1020', '#243B6B', '#7FB2FF'],
  ['#12100E', '#4A3B2A', '#D9B38C'],
  ['#140A1F', '#4B1D6B', '#C04BFF'],
  ['#0F1412', '#29473C', '#8FD1A8'],
] as const;
