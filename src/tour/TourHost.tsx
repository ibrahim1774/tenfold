import { usePathname } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { ThemeScope } from '@/design/theme';
import { tourDue, useOnboarding, type TourScreen } from '@/state/onboarding';

import { CoachMark } from './CoachMark';
import { initialTour, stepArea, TOUR_STEPS, tourReducer, type Rect } from './steps';
import { measureTargets } from './targets';

/** Which toured screen a route is. Sheets over the editor (captions, info) aren't toured. */
function screenFor(path: string): TourScreen | null {
  if (path === '/batch/setup') return 'batchSetup';
  if (path.startsWith('/editor/') && path !== '/editor/captions' && path !== '/editor/info') return 'editor';
  return null;
}

// Wait for the push transition to settle, then poll until the targets are laid out (the editor
// loads its analysis first). Gives up quietly if they never appear.
const SETTLE_MS = 450;
const POLL_MS = 250;
const GIVE_UP_MS = 8000;

/** Mounted once in the root layout, above every screen. Runs each screen's tour once when `tourEnabled`. */
export function TourHost() {
  const path = usePathname();
  const screen = screenFor(path);
  const due = useOnboarding((s) => (screen ? tourDue(s, screen) : false));
  const markTourSeen = useOnboarding((s) => s.markTourSeen);
  const [tour, dispatch] = useReducer(tourReducer, initialTour);
  // Tagged with the screen, so a highlight measured on one screen never shows on another.
  const [measured, setMeasured] = useState<{ screen: TourScreen; rect: Rect } | null>(null);
  const area = measured && measured.screen === screen ? measured.rect : null;
  const win = useWindowDimensions();

  // Start (or drop) the tour as the route changes.
  useEffect(() => {
    if (screen && due) dispatch({ type: 'start', screen });
  }, [screen, due]);

  const active = !!tour.screen && tour.screen === screen && !tour.done && due;
  const step = active && tour.screen ? TOUR_STEPS[tour.screen][tour.index] : null;

  // Measure the current step's targets.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    const started = Date.now();
    const poll = async () => {
      if (cancelled) return;
      const rects = await measureTargets(step.targets);
      const a = stepArea(step, rects, win);
      if (cancelled) return;
      if (a && tour.screen) setMeasured({ screen: tour.screen, rect: a });
      else if (Date.now() - started < GIVE_UP_MS) setTimeout(poll, POLL_MS);
    };
    const t = setTimeout(poll, tour.index === 0 ? SETTLE_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, tour.index, tour.screen, win]);

  // Finished or skipped: don't show this screen's tour again.
  useEffect(() => {
    if (tour.done && tour.screen) markTourSeen(tour.screen);
  }, [tour.done, tour.screen, markTourSeen]);

  if (!step || !area || !tour.screen) return null;
  // The coach mark draws in the palette of the screen it explains: dark over the editor, light over setup.
  return (
    <ThemeScope scheme={tour.screen === 'editor' ? 'dark' : 'light'}>
      <CoachMark
        target={area}
        title={step.title}
        body={step.body}
        index={tour.index}
        total={TOUR_STEPS[tour.screen].length}
        onNext={() => dispatch({ type: 'next' })}
        onSkip={() => dispatch({ type: 'skip' })}
      />
    </ThemeScope>
  );
}
