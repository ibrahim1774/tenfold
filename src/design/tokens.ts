// Design tokens: "light shell, dark editor" with a red-orange signature (docs/DESIGN.md §0).

/**
 * Two palettes with the same keys. The app shell (onboarding, paywall, Create, Cuts, You, import, batch
 * setup and results, and their sheets) is `light`: warm off-white, white surfaces, near-black type. The
 * editor, export, record and full-screen video are `dark`, like Photos' editor. Shared components read the
 * palette of the screen they're on through `useTheme()` (src/design/theme.tsx); screens that are only ever
 * one theme import `light` or `dark` directly.
 *
 * The brand colour is used for one thing per screen: the primary button, the chosen answer, progress, a
 * key number. Everything else is neutral.
 */

/** Red-orange signature, shared by both palettes. */
export const brand = {
  /** Solid brand tone: selected states, progress, key numbers, the playhead, switch tint. */
  primary: '#FF4A2E',
  /** The primary button: a subtle diagonal gradient. White label (about 3.1:1 at its centre). */
  gradient: ['#FF3D2E', '#FF7A33'] as const,
  /** Label and glyphs on the brand colour or gradient. */
  onBrand: '#FFFFFF',
} as const;

/**
 * Anything drawn over footage (badges, rings, dims) uses these whatever the page theme, because the image
 * under it is dark-ish and unpredictable. Glass and thumbnails also scope their children to `dark`.
 */
export const media = {
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.78)',
  dim: 'rgba(0,0,0,0.45)',
  scrim: 'rgba(0,0,0,0.35)',
  track: 'rgba(255,255,255,0.28)',
} as const;

export type Palette = {
  // Surfaces
  bg: string;
  /** `bg` at zero alpha, for gradients that fade into the page without a grey band. */
  bgClear: string;
  /** Sheet background (form sheets). */
  bgRaised: string;
  /** Raised surface: grouped rows, cards, the chosen answer. */
  card: string;
  /** Neutral fill for controls inside content (unselected chips, steppers, pressed rows). */
  cardHigh: string;
  /** Floating bubble over a dimmed screen (coach marks). */
  popover: string;
  /** Page colour at high alpha, for bars pinned over scrolling content (the footer under a primary button). */
  chrome: string;
  border: string;
  borderStrong: string;
  overlay: string;
  /** Hairline between rows inside an inset group. */
  separator: string;
  /** What a glass control draws where Liquid Glass isn't available. */
  glassFallback: string;
  /** Progress bar and ring track. */
  track: string;

  // Text (every text grey meets WCAG AA on `bg` and `card`)
  textPrimary: string;
  textSecondary: string;
  /** Small print: renewal terms, footers, captions. Still AA. */
  textMuted: string;
  /** Glyph-only grey: chevrons, empty radio circles, strike-through lines. Never for text. */
  glyph: string;
  textInverse: string;

  // Brand
  accent: string;
  accentSoft: string;
  /** Brand colour for small text (links, "Set up", plan names): darkened on light for AA. */
  accentText: string;

  // Status
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  heart: string;

  // Controls
  chipFill: string;
  chipText: string;
  chipSelectedFill: string;
  chipSelectedText: string;
  ruler: string;
  waveform: string;
};

export const light: Palette = {
  bg: '#F5F4F2',
  bgClear: 'rgba(245,244,242,0)',
  bgRaised: '#F5F4F2',
  card: '#FFFFFF',
  cardHigh: '#ECEAE7',
  popover: '#FFFFFF',
  chrome: 'rgba(245,244,242,0.94)',
  border: 'rgba(0,0,0,0.06)',
  borderStrong: 'rgba(0,0,0,0.12)',
  overlay: 'rgba(17,15,13,0.55)',
  separator: 'rgba(0,0,0,0.08)',
  glassFallback: 'rgba(44,44,48,0.78)',
  track: '#E6E4E1',

  textPrimary: '#111111',
  textSecondary: '#5E5B57',
  textMuted: '#6F6C68',
  glyph: '#A09D99',
  textInverse: '#FFFFFF',

  accent: brand.primary,
  accentSoft: 'rgba(255,74,46,0.10)',
  accentText: '#CF3419',

  danger: '#D70015',
  dangerSoft: 'rgba(215,0,21,0.08)',
  success: '#248A3D',
  warning: '#B25000',
  heart: '#D70015',

  chipFill: '#EAE8E4',
  chipText: '#111111',
  chipSelectedFill: '#111111',
  chipSelectedText: '#FFFFFF',
  ruler: '#A09D99',
  waveform: '#8A8783',
};

export const dark: Palette = {
  bg: '#0B0B0C',
  bgClear: 'rgba(11,11,12,0)',
  bgRaised: '#111112',
  card: '#161617',
  cardHigh: '#262628',
  popover: '#2C2C2E',
  chrome: 'rgba(11,11,12,0.92)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  overlay: 'rgba(0,0,0,0.72)',
  separator: 'rgba(84,84,88,0.45)',
  glassFallback: 'rgba(44,44,48,0.78)',
  track: 'rgba(255,255,255,0.14)',

  textPrimary: '#F5F5F5',
  textSecondary: '#9A9A9E',
  textMuted: '#86868B',
  glyph: '#6E6E73',
  textInverse: '#000000',

  accent: brand.primary,
  accentSoft: 'rgba(255,74,46,0.18)',
  accentText: '#FF5A3C',

  danger: '#FF453A',
  dangerSoft: 'rgba(255,69,58,0.16)',
  success: '#30D158',
  warning: '#FF9F0A',
  heart: '#FF453A',

  chipFill: '#2C2C2E',
  chipText: '#FFFFFF',
  chipSelectedFill: '#FFFFFF',
  chipSelectedText: '#000000',
  ruler: '#6E6E73',
  waveform: '#8E8E95',
};

export type Scheme = 'light' | 'dark';
export const palettes: Record<Scheme, Palette> = { light, dark };

/**
 * One shadow recipe (0 8 24 warm black at 8%), in two sizes: `soft` for surfaces that lift off the page
 * (video tiles, plan cards, pills), `control` for small floating controls (icon buttons, secondary
 * buttons). Light screens only; dark screens don't use shadows. A view with a shadow can't also clip
 * (`overflow: 'hidden'`) on iOS, so shadows go on an outer wrapper with a background.
 */
export const shadows = {
  soft: {
    shadowColor: '#14100C',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  control: {
    shadowColor: '#14100C',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
} as const;

/** Solid colours for the few places that still read these names (progress bars and rings). */
export const gradients = {
  cta: brand.gradient,
  progress: [brand.primary, brand.primary] as const,
};

/**
 * Three radii: 20 for large surfaces and big media (cards, grouped rows, batch tiles, posters), 12 for
 * small objects (thumbnails, tiles, segments), and round for capsules. `chip` is a capsule at chip height.
 */
export const radii = {
  card: 20,
  tile: 12,
  chip: 18,
  button: 12,
  thumb: 12,
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
 * Two faces. Headings, big figures, buttons and strong labels use Instrument Sans (OFL, bundled via
 * expo-font; iOS names are the PostScript names). Running text, secondary text and small print stay on the
 * iPhone's own SF Pro (`fontFamily` undefined + a weight) for legibility. Poppins and the other bundled
 * faces are for captions only (src/captions/presets.ts).
 */
export const fonts = {
  regular: undefined,
  medium: 'InstrumentSans-Medium',
  semiBold: 'InstrumentSans-SemiBold',
  bold: 'InstrumentSans-Bold',
} as const;

export const weights = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
} as const;

/**
 * Six sizes, no more (docs/DESIGN.md): 32 screen titles · 20 section/sheet titles · 15 body ·
 * 14 controls · 13 secondary · 12 small print. Large sizes are tracked tight. Legacy names map onto them.
 */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 37, letterSpacing: -0.9 },
  title: { fontFamily: fonts.semiBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.35 },
  body: { fontWeight: weights.regular, fontSize: 15, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  chip: { fontWeight: weights.medium, fontSize: 14, lineHeight: 18 },
  label: { fontWeight: weights.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontWeight: weights.regular, fontSize: 12, lineHeight: 16 },
  // Legacy aliases (same sizes as above).
  hero: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 37, letterSpacing: -0.9 },
  section: { fontFamily: fonts.semiBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.35 },
  cta: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
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
