import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { tierOf, useEntitlements } from '@/state/entitlements';

import { setTraits, startAnalytics, trackScreen } from './posthog';

/**
 * Starts PostHog, records a screen view per route (its pattern, e.g. `batch/[batchId]`, never ids) and keeps
 * the person's plan on their profile and on every event. Renders nothing.
 */
export function AnalyticsBridge() {
  const segments = useSegments();
  // Empty until the router has picked the first screen; tabs' group names are left out.
  const screen = segments.length ? segments.filter((s) => !s.startsWith('(')).join('/') || 'home' : null;
  const tier = useEntitlements((s) => tierOf(s));
  const billing = useEntitlements((s) => s.billing);

  useEffect(() => {
    startAnalytics();
  }, []);

  useEffect(() => {
    if (screen) trackScreen(screen);
  }, [screen]);

  useEffect(() => {
    setTraits({ tier, billing }, true);
  }, [tier, billing]);

  return null;
}
