import type { CaptionFont, CaptionSettings, CaptionStyleId } from '../engine/types';

// Mirrored in Swift (CaptionLayerBuilder) in M2. Any change here must be made there too.

export type CaptionAnimation = 'pop' | 'karaoke' | 'box' | 'none' | 'underline';

export type CaptionPreset = {
  id: CaptionStyleId;
  name: string;
  font: CaptionFont;
  sizeRatio: number; // font size relative to frame width
  colors: CaptionSettings['colors'];
  strokeWidth: number;
  shadow: boolean;
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
    sizeRatio: 0.052,
    colors: { base: '#FFFFFF', active: '#FFE14D', stroke: '#000000', bg: 'transparent' },
    strokeWidth: 6,
    shadow: true,
    uppercase: false,
    positionY: 0.66,
    animation: 'pop',
    maxWords: 4,
    free: true,
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    font: 'montserrat',
    sizeRatio: 0.052,
    colors: { base: '#FFFFFF', active: '#B07CFF', stroke: '#000000', bg: 'transparent' },
    strokeWidth: 0,
    shadow: true,
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
    sizeRatio: 0.048,
    colors: { base: '#FFFFFF', active: '#FFFFFF', stroke: 'transparent', bg: 'rgba(15,18,34,0.85)' },
    strokeWidth: 0,
    shadow: false,
    uppercase: false,
    positionY: 0.66,
    animation: 'box',
    maxWords: 5,
    free: true,
  },
  {
    id: 'outline',
    name: 'Outline',
    font: 'bebas',
    sizeRatio: 0.07,
    colors: { base: '#FFFFFF', active: '#FFFFFF', stroke: '#000000', bg: 'transparent' },
    strokeWidth: 10,
    shadow: false,
    uppercase: true,
    positionY: 0.64,
    animation: 'none',
    maxWords: 3,
    free: false,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    font: 'poppins',
    sizeRatio: 0.045,
    colors: { base: '#FFFFFF', active: '#FFFFFF', stroke: 'transparent', bg: 'transparent' },
    strokeWidth: 0,
    shadow: true,
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
    sizeRatio: 0.036,
    colors: { base: '#FFFFFF', active: '#FFFFFF', stroke: 'transparent', bg: 'transparent' },
    strokeWidth: 0,
    shadow: true,
    uppercase: false,
    positionY: 0.8,
    animation: 'none',
    maxWords: 7,
    free: false,
  },
];

export const CAPTION_FONTS: { id: CaptionFont; name: string }[] = [
  { id: 'poppins', name: 'Poppins' },
  { id: 'inter', name: 'Inter Black' },
  { id: 'bebas', name: 'Bebas Neue' },
  { id: 'montserrat', name: 'Montserrat' },
  { id: 'sfRounded', name: 'SF Rounded' },
];

export const CAPTION_COLORS = ['#FFE14D', '#B07CFF', '#4DD8FF', '#FF7A59', '#5BE3A5', '#FFFFFF'];

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
