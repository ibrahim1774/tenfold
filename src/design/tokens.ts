// Design tokens derived from the reference screens (spec §5.1).

export const colors = {
  // Background mesh
  bgPeach: '#F6D7C3',
  bgLavender: '#D9CDF2',
  bgSky: '#C9E4F6',
  bgDarkTop: '#0F1222',
  bgDarkBottom: '#1B1E3A',

  // Glass
  glassFill: 'rgba(22,26,48,0.55)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassShadow: 'rgba(10,12,30,0.35)',

  // Chips
  chipFill: 'rgba(42,50,86,0.9)',
  chipText: '#E8ECFF',
  chipSelectedFill: '#FFFFFF',
  chipSelectedText: '#151A33',

  // Tools panel
  toolPanel: '#4C8BFF',
  toolFill: 'rgba(60,90,220,0.35)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.72)',
  textMuted: 'rgba(255,255,255,0.5)',
  textOnLight: '#151A33',
  textOnLightMuted: 'rgba(21,26,51,0.6)',

  // Accents
  badgeOrange: '#FF7A3D',
  danger: '#FF5A6E',
  success: '#5BE3A5',
  ruler: 'rgba(255,255,255,0.8)',
} as const;

export const gradients = {
  cta: ['#4DD8FF', '#B07CFF', '#FF7A59', '#FFC24D'] as const,
  backgroundLight: [colors.bgPeach, colors.bgLavender, colors.bgSky] as const,
  backgroundDark: [colors.bgDarkTop, colors.bgDarkBottom] as const,
  // Dark wash that the glass stack sits on, like the lower half of the reference screens
  screenWash: ['rgba(27,30,58,0)', 'rgba(27,30,58,0.55)', 'rgba(15,18,34,0.92)'] as const,
};

export const radii = {
  card: 28,
  chip: 22,
  cta: 30,
  thumb: 14,
  round: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  gutter: 16,
} as const;

export const fonts = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semiBold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.3 },
  title: { fontFamily: fonts.semiBold, fontSize: 26, lineHeight: 32 },
  section: { fontFamily: fonts.semiBold, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 23 },
  chip: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  cta: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
} as const;

export const sizes = {
  chipHeight: 44,
  ctaHeight: 60,
  roundTool: 64,
  iconButton: 44,
} as const;

export const motion = {
  spring: { damping: 18, stiffness: 160 },
  pressScale: 0.97,
} as const;
