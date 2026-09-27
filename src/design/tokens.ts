// Design tokens: dark "cinematic" theme (docs/SPEC.md §5.1, reference docs/design-reference-v2.png).

export const colors = {
  // Surfaces
  bg: '#0A090E',
  bgRaised: '#111016',
  card: '#15141B',
  cardHigh: '#1C1B23',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.18)',
  overlay: 'rgba(10,9,14,0.72)',

  // Ambient glow behind the top of each screen
  glowPlum: 'rgba(120,36,92,0.55)',
  glowViolet: 'rgba(76,40,140,0.45)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#B3B0BD',
  textMuted: '#77737F',
  textInverse: '#0A090E',

  // Accents
  violet: '#8B5CF6',
  violetSoft: 'rgba(139,92,246,0.18)',
  /** Text for in-place actions and small accents (links, "Pro"). */
  accentText: '#C9B6FF',
  orange: '#FF7A30',
  danger: '#FF5A6E',
  dangerSoft: 'rgba(255,90,110,0.16)',
  success: '#4ADE80',
  heart: '#FF3B55',

  // Controls
  chipFill: '#1C1B23',
  chipText: '#E9E7F0',
  chipSelectedFill: '#FFFFFF',
  chipSelectedText: '#0A090E',
  ruler: '#8E8A98',
  waveform: '#B9B5C4',
} as const;

export const gradients = {
  cta: ['#7C4DFF', '#C94FC0', '#FF7A30'] as const,
  glow: ['rgba(120,36,92,0.55)', 'rgba(40,20,60,0.25)', 'rgba(10,9,14,0)'] as const,
};

export const radii = {
  card: 24,
  tile: 20,
  chip: 22,
  button: 20,
  thumb: 16,
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

export const fonts = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semiBold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
} as const;

/**
 * Six sizes, no more (docs/DESIGN.md): 30 screen titles · 20 section/sheet titles · 15 body ·
 * 14 controls · 13 secondary · 12 small print. Legacy names map onto them.
 */
export const type = {
  display: { fontFamily: fonts.semiBold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.semiBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  chip: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  label: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  // Legacy aliases (same sizes as above).
  hero: { fontFamily: fonts.semiBold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  section: { fontFamily: fonts.semiBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  cta: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
} as const;

export const sizes = {
  chipHeight: 40,
  ctaHeight: 56,
  iconButton: 44,
  tabBarHeight: 72,
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
