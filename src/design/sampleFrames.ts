/**
 * Ten still frames of people talking to camera, bundled with the app so illustrative screens (onboarding,
 * import, caption style previews) never show an empty box. Creator-style (UGC) stills from Mixkit stock clips under the Mixkit
 * free licence; see marketing/screenshots/FOOTAGE.md.
 */
export const SAMPLE_FRAMES: number[] = [
  require('../../assets/onboarding/take01.jpg'),
  require('../../assets/onboarding/take02.jpg'),
  require('../../assets/onboarding/take03.jpg'),
  require('../../assets/onboarding/take04.jpg'),
  require('../../assets/onboarding/take05.jpg'),
  require('../../assets/onboarding/take06.jpg'),
  require('../../assets/onboarding/take07.jpg'),
  require('../../assets/onboarding/take08.jpg'),
  require('../../assets/onboarding/take09.jpg'),
  require('../../assets/onboarding/take10.jpg'),
];

export const sampleFrame = (n: number): number => SAMPLE_FRAMES[Math.abs(n) % SAMPLE_FRAMES.length];
