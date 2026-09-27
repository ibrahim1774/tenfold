import type {
  CaptionAnimation,
  CaptionBackground,
  CaptionFont,
  CaptionOutline,
  CaptionSettings,
  CaptionStyleId,
} from '../engine/types';

// Mirrored in Swift (Engine/Core/CaptionStyles.swift + CaptionLayerBuilder). Keep both in sync.

export type { CaptionAnimation, CaptionBackground, CaptionOutline };

export type CaptionPreset = {
  id: CaptionStyleId;
  name: string;
  font: CaptionFont;
  colors: CaptionSettings['colors'];
  uppercase: boolean;
  positionY: number; // 0..1 from top
  animation: CaptionAnimation;
  maxWords: number;
  free: boolean; // available on the free tier
};

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'pop',
    name: 'Pop',
    font: 'poppins',
    colors: { base: '#FFFFFF', active: '#FFE14D', stroke: '#000000', bg: 'transparent' },
    uppercase: false,
    positionY: 0.66,
    animation: 'pop',
    maxWords: 4,
    free: true,
  },
  {
    id: 'tiktok',
    name: 'TikTok Classic',
    font: 'tiktok',
    colors: { base: '#FFFFFF', active: '#FFFFFF', stroke: 'transparent', bg: 'rgba(0,0,0,0.88)' },
    uppercase: false,
    positionY: 0.64,
    animation: 'classic',
    maxWords: 5,
    free: true,
  },
  {
    id: 'highlight',
    name: 'Highlight',
    font: 'tiktok',
    colors: { base: '#FFFFFF', active: '#7C4DFF', stroke: 'transparent', bg: 'transparent' },
    uppercase: false,
    positionY: 0.66,
    animation: 'highlight',
    maxWords: 3,
    free: false,
  },
  {
    id: 'oneword',
    name: 'One Word',
    font: 'tiktok',
    colors: { base: '#FFFFFF', active: '#FFE14D', stroke: '#000000', bg: 'transparent' },
    uppercase: true,
    positionY: 0.6,
    animation: 'pop',
    maxWords: 1,
    free: false,
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    font: 'montserrat',
    colors: { base: '#FFFFFF', active: '#B07CFF', stroke: '#000000', bg: 'transparent' },
    uppercase: false,
    positionY: 0.66,
    animation: 'karaoke',
    maxWords: 4,
    free: false,
  },
  {
    id: 'boxed',
    name: 'Boxed',
    font: 'poppins',
    colors: { base: '#FFFFFF', active: '#FFE14D', stroke: 'transparent', bg: 'rgba(15,18,34,0.85)' },
    uppercase: false,
    positionY: 0.66,
    animation: 'box',
    maxWords: 5,
    free: true,
  },
  {
    id: 'neon',
    name: 'Neon',
    font: 'tiktok',
    colors: { base: '#FFFFFF', active: '#FF3DCB', stroke: 'transparent', bg: 'transparent' },
    uppercase: true,
    positionY: 0.64,
    animation: 'neon',
    maxWords: 3,
    free: false,
  },
  {
    id: 'typewriter',
    name: 'Typewriter',
    font: 'typewriter',
    colors: { base: '#FFFFFF', active: '#FFFFFF', stroke: 'transparent', bg: 'transparent' },
    uppercase: false,
    positionY: 0.66,
    animation: 'reveal',
    maxWords: 6,
    free: false,
  },
  {
    id: 'outline',
    name: 'Outline',
    font: 'bebas',
    colors: { base: '#FFFFFF', active: '#FFFFFF', stroke: '#000000', bg: 'transparent' },
    uppercase: true,
    positionY: 0.64,
    animation: 'none',
    maxWords: 3,
    free: false,
  },
  {
    id: 'handwritten',
    name: 'Handwritten',
    font: 'handwriting',
    colors: { base: '#FFFFFF', active: '#FFFFFF', stroke: 'transparent', bg: 'transparent' },
    uppercase: false,
    positionY: 0.66,
    animation: 'none',
    maxWords: 5,
    free: false,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    font: 'poppins',
    colors: { base: '#FFFFFF', active: '#FFE14D', stroke: 'transparent', bg: 'transparent' },
    uppercase: false,
    positionY: 0.68,
    animation: 'underline',
    maxWords: 5,
    free: true,
  },
  {
    id: 'subtle',
    name: 'Subtle',
    font: 'sfRounded',
    colors: { base: '#FFFFFF', active: '#FFFFFF', stroke: 'transparent', bg: 'transparent' },
    uppercase: false,
    positionY: 0.7,
    animation: 'none',
    maxWords: 7,
    free: false,
  },
];

/** Caption fonts. The first four are TikTok's built-in text fonts (TikTok Sans is bundled; the others are the iOS system equivalents). */
export const CAPTION_FONTS: { id: CaptionFont; name: string; family: string }[] = [
  { id: 'tiktok', name: 'TikTok Sans', family: 'TikTokSans-ExtraBold' },
  { id: 'typewriter', name: 'Typewriter', family: 'AmericanTypewriter-Bold' },
  { id: 'handwriting', name: 'Handwriting', family: 'Noteworthy-Bold' },
  { id: 'serif', name: 'Serif', family: 'Georgia-Bold' },
  { id: 'poppins', name: 'Poppins', family: 'Poppins-Bold' },
  { id: 'inter', name: 'Inter Black', family: 'Inter-Black' },
  { id: 'bebas', name: 'Bebas Neue', family: 'BebasNeue-Regular' },
  { id: 'montserrat', name: 'Montserrat', family: 'Montserrat-ExtraBold' },
  { id: 'sfRounded', name: 'SF Rounded', family: 'System' },
];

/** Caption formats: how many words appear at once. */
export const CAPTION_FORMATS: { maxWords: number; name: string }[] = [
  { maxWords: 1, name: 'One word' },
  { maxWords: 3, name: 'Short' },
  { maxWords: 5, name: 'Phrase' },
  { maxWords: 7, name: 'Sentence' },
];

export const CAPTION_COLORS = ['#FFE14D', '#7C4DFF', '#FF3DCB', '#4DD8FF', '#FF7A59', '#5BE3A5', '#FFFFFF'];

/** Extra swatches for the colour grid when the system colour picker isn't available. */
export const MORE_CAPTION_COLORS = [
  '#000000', '#1C1C1E', '#8E8E93', '#FF453A', '#FF9F0A', '#FFD60A',
  '#32D74B', '#64D2FF', '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F',
];

/**
 * Look defaults per preset, matching Swift CaptionStyle.forId (background, outline width, shadow).
 * The engine's preset outlines are 6–10 px; they read as the nearest of Thin (4) / Thick (10).
 */
const PRESET_LOOK: Record<Exclude<CaptionStyleId, 'custom'>, { background: CaptionBackground; outline: CaptionOutline; shadow: boolean }> = {
  pop: { background: 'none', outline: 'thin', shadow: true },
  tiktok: { background: 'box', outline: 'none', shadow: false },
  highlight: { background: 'highlight', outline: 'none', shadow: true },
  oneword: { background: 'none', outline: 'thick', shadow: true },
  karaoke: { background: 'none', outline: 'none', shadow: true },
  boxed: { background: 'box', outline: 'none', shadow: false },
  neon: { background: 'none', outline: 'none', shadow: false },
  typewriter: { background: 'none', outline: 'none', shadow: true },
  outline: { background: 'none', outline: 'thick', shadow: false },
  handwritten: { background: 'none', outline: 'none', shadow: true },
  minimal: { background: 'none', outline: 'none', shadow: true },
  subtle: { background: 'none', outline: 'none', shadow: true },
};

/**
 * "Custom": shown when a preset's look was changed. Not part of CAPTION_PRESETS (that list is the
 * catalogue the paywall counts and the batch setup shows); `presetById('custom')` returns it.
 */
export const CUSTOM_PRESET: CaptionPreset = { ...CAPTION_PRESETS[0], id: 'custom', name: 'Custom', free: true };

export function presetById(id: CaptionStyleId): CaptionPreset {
  if (id === 'custom') return CUSTOM_PRESET;
  return CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0];
}

/** The catalogue preset these settings are built on ('custom' → the preset it started from). */
export function basePresetId(c: Pick<CaptionSettings, 'styleId' | 'baseStyleId'>): Exclude<CaptionStyleId, 'custom'> {
  if (c.styleId !== 'custom') return c.styleId;
  return c.baseStyleId ?? 'pop';
}

export function basePreset(c: Pick<CaptionSettings, 'styleId' | 'baseStyleId'>): CaptionPreset {
  return presetById(basePresetId(c));
}

export type CaptionLook = { background: CaptionBackground; outline: CaptionOutline; shadow: boolean; animation: CaptionAnimation };

/** The look the engine renders: overrides, else the base preset's own (Swift CaptionStyle.resolve). */
export function lookOf(c: CaptionSettings): CaptionLook {
  const id = basePresetId(c);
  const d = PRESET_LOOK[id] ?? PRESET_LOOK.pop;
  return {
    background: c.background ?? d.background,
    outline: c.outline ?? d.outline,
    shadow: c.shadow ?? d.shadow,
    animation: c.animation ?? presetById(id).animation,
  };
}

/** Look-changing properties: changing any of them turns the style into 'custom'. */
export type LookPatch = Partial<Pick<CaptionSettings, 'font' | 'colors' | 'uppercase' | 'background' | 'outline' | 'shadow' | 'animation'>>;

/**
 * Applies a change to the look and marks the style 'custom' (built on the same preset). Layout
 * (size, position, words on screen) and the on/off switch are not "look" and use plain spreads.
 */
export function withLook(c: CaptionSettings, patch: LookPatch): CaptionSettings {
  return { ...c, ...patch, styleId: 'custom', baseStyleId: basePresetId(c) };
}

/** Back to the base preset's own look (drops 'custom' and every override), keeping layout and on/off. */
export function withoutLook(c: CaptionSettings): CaptionSettings {
  const fresh = captionSettingsFromPreset(basePresetId(c));
  return { ...fresh, sizeScale: c.sizeScale, position: c.position, maxWords: c.maxWords, enabled: c.enabled };
}

export function captionSettingsFromPreset(id: CaptionStyleId): CaptionSettings {
  const p = presetById(id === 'custom' ? 'pop' : id);
  return {
    styleId: p.id,
    font: p.font,
    sizeScale: 1,
    colors: p.colors,
    position: { y: p.positionY },
    uppercase: p.uppercase,
    maxWords: p.maxWords,
    enabled: true,
  };
}
