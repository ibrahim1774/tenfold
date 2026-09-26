import type { CaptionFont, CaptionSettings, CaptionStyleId } from '../engine/types';

// Mirrored in Swift (Engine/Core/CaptionStyles.swift + CaptionLayerBuilder). Keep both in sync.

export type CaptionAnimation = 'pop' | 'karaoke' | 'box' | 'none' | 'underline' | 'highlight' | 'neon' | 'reveal' | 'classic';

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
    positionY: 0.8,
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

export function presetById(id: CaptionStyleId): CaptionPreset {
  return CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0];
}

export function captionSettingsFromPreset(id: CaptionStyleId): CaptionSettings {
  const p = presetById(id);
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
