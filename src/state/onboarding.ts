import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

// Onboarding answers and tour flags. "What you make" lives in the settings store (`contentTypes`),
// because it sets the default preset.

export type Role = 'creator' | 'coach' | 'brand' | 'agency' | 'seller' | 'personal';
export type VideosPerWeek = '1-2' | '3-5' | '6+';
export type MinutesPerVideo = 'under10' | '10-30' | '30-60' | '60+';
export type TourScreen = 'batchSetup' | 'editor';

export type OnboardingAnswers = {
  role: Role | null;
  videosPerWeek: VideosPerWeek | null;
  minutesPerVideo: MinutesPerVideo | null;
};

type OnboardingState = OnboardingAnswers & {
  /** The person asked to be shown around (Ready screen, or "Replay the tour" in Settings). */
  tourEnabled: boolean;
  /** Screens whose tour has been shown (finished or skipped). */
  tourSeen: Record<TourScreen, boolean>;
  setRole: (v: Role | null) => void;
  setVideosPerWeek: (v: VideosPerWeek | null) => void;
  setMinutesPerVideo: (v: MinutesPerVideo | null) => void;
  setTourEnabled: (v: boolean) => void;
  markTourSeen: (screen: TourScreen) => void;
  /** Settings → Replay the tour. */
  resetTour: () => void;
};

export const ONBOARDING_STORE_KEY = 'tenfold.onboarding';

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      role: null,
      videosPerWeek: null,
      minutesPerVideo: null,
      tourEnabled: false,
      tourSeen: { batchSetup: false, editor: false },
      setRole: (role) => set({ role }),
      setVideosPerWeek: (videosPerWeek) => set({ videosPerWeek }),
      setMinutesPerVideo: (minutesPerVideo) => set({ minutesPerVideo }),
      setTourEnabled: (tourEnabled) => set({ tourEnabled }),
      markTourSeen: (screen) => set((s) => ({ tourSeen: { ...s.tourSeen, [screen]: true } })),
      resetTour: () => set({ tourEnabled: true, tourSeen: { batchSetup: false, editor: false } }),
    }),
    { name: ONBOARDING_STORE_KEY, storage: persistStorage, version: 1 },
  ),
);

/** Should this screen's tour run now? */
export function tourDue(s: Pick<OnboardingState, 'tourEnabled' | 'tourSeen'>, screen: TourScreen): boolean {
  return s.tourEnabled && !s.tourSeen[screen];
}
