// Design tokens: dark "cinematic" theme (docs/SPEC.md §5.1, reference docs/design-reference-v2.png).

/**
 * "Graphite": flat near-black surfaces, white type, black and white only (no colour accent). The footage is the
 * only colour on screen. (The earlier purple-glow theme lives in git history; swapping this block
 * back restores it.)
 */
export const colors = {
  // Surfaces: black canvas, two steps of elevation.
  bg: '#000000',
  bgRaised: '#0C0C0E',
  // iOS dark grouped values, so borderless groups still read against black.
  card: '#1C1C1E',
  cardHigh: '#2C2C2E',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  overlay: 'rgba(0,0,0,0.72)',
  /** Hairline between rows inside an inset group (iOS separator, dark). */
  separator: 'rgba(84,84,88,0.45)',
  /** What a glass control draws where Liquid Glass isn't available: translucent graphite. */
  glassFallback: 'rgba(44,44,48,0.78)',

  // Legacy names for the old ambient glow (now flat).
  glowPlum: 'rgba(0,0,0,0)',
  glowViolet: 'rgba(0,0,0,0)',

  /** Hairline light edge on chips, cards and tiles: the glossy rim of a glass surface. */
  edge: 'rgba(255,255,255,0.10)',

  // Text: a soft white, not pure white, so type sits back and the white button and selection stand out.
  textPrimary: '#ECECEF',
  textSecondary: '#9C9CA3',
  textMuted: '#6B6B72',
  textInverse: '#000000',

  // Black and white only (2026-09-29): the "accent" is white. Progress, selection, the playhead, links.
  accent: '#FFFFFF',
  accentSoft: 'rgba(255,255,255,0.14)',
  /** Text for in-place actions and small accents (links, "Pro"). */
  accentText: '#FFFFFF',
  // Legacy names, mapped onto the accent.
  violet: '#FFFFFF',
  violetSoft: 'rgba(255,255,255,0.14)',
  orange: '#FFFFFF',
  danger: '#FF453A',
  dangerSoft: 'rgba(255,69,58,0.16)',
  success: '#30D158',
  heart: '#FF453A',

  // Controls
  // Clear glass: a translucent fill with a light edge (`edge`), not a solid grey.
  chipFill: 'rgba(255,255,255,0.11)',
  chipText: '#ECECEF',
  chipSelectedFill: '#FFFFFF',
  chipSelectedText: '#000000',
  ruler: '#6B6B72',
  waveform: '#8E8E95',
} as const;

/**
 * Timeline track colours (2026-09-29, the user's reference): pastel yellow for text and captions, lilac for
 * sound. The only colour in the app besides footage; everything else stays black and white. Ink is the text
 * and icon colour on the pastel; the icon sits on a lighter square chip at the left of each clip.
 */
export const track = {
  text: '#F4D993',
  textIcon: '#FFF2DB',
  textInk: '#3A2E10',
  audio: '#D6C5FB',
  audioIcon: '#EFE8FF',
  audioInk: '#2C2146',
  audioWave: '#6A559E',
} as const;

/** Solid colours now; the names stay so progress bars and rings keep working. */
export const gradients = {
  cta: ['#FFFFFF', '#FFFFFF'] as const,
  progress: ['#FFFFFF', '#FFFFFF'] as const,
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
 * One face: Inter (OFL, assets/fonts/Inter-OFL.txt, bundled via expo-font; iOS names are the PostScript
 * names). Every text style names its weight's file directly, so no style depends on fontWeight picking a
 * face. Poppins and the other bundled faces are for captions only (src/captions/presets.ts).
 */
export const fonts = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
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
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.4 },
  title: { fontFamily: fonts.semiBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 20 },
  chip: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18 },
  label: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  // Legacy aliases (same sizes as above).
  hero: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.4 },
  section: { fontFamily: fonts.semiBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  cta: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 20 },
} as const;

export const sizes = {
  chipHeight: 36,
  ctaHeight: 52,
  iconButton: 44,
  tabBarHeight: 50,
} as const;

/**
 * Motion explains a change; it never decorates (docs/DESIGN.md). Things the finger touches spring back with
 * a small bounce (`bounce`), like iOS controls; values and layout use the critically damped `spring`.
 * Short ease-out timings, and no entrance animations on screens or lists.
 */
export const motion = {
  spring: { damping: 30, stiffness: 320, overshootClamping: true },
  /** Release of a press and the pop of a new selection: one small overshoot, settled in about 350 ms. */
  bounce: { damping: 13, stiffness: 320, mass: 0.8 },
  pressScale: 0.96,
  /** How far a control swells when it becomes selected, before `bounce` settles it. */
  popScale: 1.06,
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
