import type { AspectRatio, EditDocument, MediaInfo } from '@/engine/types';

export const ASPECTS: { id: AspectRatio; label: string; hint: string }[] = [
  { id: '9:16', label: '9:16', hint: 'TikTok, Reels, Shorts' },
  { id: '4:5', label: '4:5', hint: 'Instagram feed' },
  { id: '1:1', label: '1:1', hint: 'Square' },
  { id: '16:9', label: '16:9', hint: 'YouTube' },
  { id: 'original', label: 'Original', hint: 'Keep the clip’s shape' },
];

export function aspectOf(crop: EditDocument['crop']): AspectRatio {
  return crop.aspect ?? (crop.auto916 ? '9:16' : 'original');
}

/** Output width ÷ height, matching CropSettings.ratio / CompositionBuilder.renderSize in the engine. */
export function aspectRatioValue(aspect: AspectRatio, media?: Pick<MediaInfo, 'width' | 'height'>): number {
  switch (aspect) {
    case '9:16':
      return 9 / 16;
    case '4:5':
      return 4 / 5;
    case '1:1':
      return 1;
    case '16:9':
      return 16 / 9;
    default:
      return media && media.width > 0 && media.height > 0 ? media.width / media.height : 9 / 16;
  }
}
