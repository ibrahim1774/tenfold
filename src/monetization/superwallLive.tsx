// Everything that touches expo-superwall. Loaded only when the native module is in this build
// (see ./superwall.ts), because importing expo-superwall without it throws at launch.
import { router } from 'expo-router';
import {
  SuperwallProvider,
  usePlacement,
  useSuperwall,
  useSuperwallEvents,
  useUser,
  type PaywallSkippedReason,
} from 'expo-superwall';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { PRODUCT_IDS, tierRank } from '@/onboarding/plans';
import { tierOf, useEntitlements } from '@/state/entitlements';
import { useOnboarding } from '@/state/onboarding';
import { useSettings } from '@/state/settings';

import { SUPERWALL_IOS_KEY } from './keys';
import { onboardingAttributes, tierFromEntitlements, tierFromStatus } from './tiers';
import type { GateRequest, PurchaseOutcome, StoreActions, StorePrice } from './types';

const API_KEYS = { ios: SUPERWALL_IOS_KEY };

function onConfigurationError(error: Error) {
  // The app keeps working on the last known tier; gated taps fall back to the native paywall.
  if (__DEV__) console.warn('[Superwall] configuration failed:', error.message);
}

export function LiveProvider({ children }: { children: ReactNode }) {
  return (
    <SuperwallProvider apiKeys={API_KEYS} onConfigurationError={onConfigurationError}>
      <SubscriptionSync />
      <AttributeSync />
      {__DEV__ ? <DevEventLogger /> : null}
      {children}
    </SuperwallProvider>
  );
}

/** Superwall's subscription status → the persisted tier. UNKNOWN keeps the last known tier. */
function SubscriptionSync() {
  const { subscriptionStatus } = useUser();
  useEffect(() => {
    const s = useEntitlements.getState();
    const next = tierFromStatus(subscriptionStatus, tierOf(s));
    if (s.tier !== next || s.isPro !== (next !== 'free')) s.setTier(next);
  }, [subscriptionStatus]);
  return null;
}

/** Onboarding answers as Superwall user attributes, once onboarding is done. No personal data. */
function AttributeSync() {
  const onboarded = useSettings((s) => s.onboarded);
  const language = useSettings((s) => s.language);
  const role = useOnboarding((s) => s.role);
  const videosPerWeek = useOnboarding((s) => s.videosPerWeek);
  const minutesPerVideo = useOnboarding((s) => s.minutesPerVideo);
  const { update } = useUser();
  // `update` is a new function on every render, so remember what was sent instead of relying on deps.
  const sent = useRef('');
  useEffect(() => {
    if (!onboarded) return;
    const attrs = onboardingAttributes({ role, videosPerWeek, minutesPerVideo }, language);
    const key = JSON.stringify(attrs);
    if (key === sent.current) return;
    sent.current = key;
    update(attrs).catch(() => {
      sent.current = ''; // try again on the next change
    });
  }, [onboarded, role, videosPerWeek, minutesPerVideo, language, update]);
  return null;
}

/** QA: paywall events in the Metro console. Development builds only. */
function DevEventLogger() {
  useSuperwallEvents({
    onSuperwallEvent: (info) => console.log('[Superwall] event', info.event.event, info.params),
    onPaywallPresent: (info) => console.log('[Superwall] paywall presented', info.name),
    onPaywallDismiss: (info, result) => console.log('[Superwall] paywall dismissed', info.name, result.type),
    onPaywallSkip: (reason) => console.log('[Superwall] paywall skipped', reason.type),
    onPaywallError: (error) => console.log('[Superwall] paywall error', error),
    onSubscriptionStatusChange: (status) => console.log('[Superwall] subscription status', JSON.stringify(status)),
  });
  return null;
}

function showFallback(req: GateRequest) {
  router.push(req.fallback ?? { pathname: '/paywall', params: { from: req.placement } });
}

/** Raises the local tier from Superwall's entitlements right after a purchase, before the status event lands. */
async function refreshTier(getEntitlements: () => Promise<{ active: { id: string }[] }>) {
  try {
    const info = await getEntitlements();
    const fresh = tierFromEntitlements(info.active.map((e) => e.id));
    const s = useEntitlements.getState();
    if (tierRank(fresh) > tierRank(tierOf(s))) s.setTier(fresh);
  } catch {
    // Keep the last known tier.
  }
}

/** Registers placements through Superwall; see ./superwall.ts `usePaywallGate`. */
export function useLiveGate(): (req: GateRequest) => void {
  const current = useRef<{ req: GateRequest; presented: boolean; skip: PaywallSkippedReason | null; done: boolean } | null>(null);
  const { getEntitlements } = useUser();
  // Configured once is enough: a later config refresh failing leaves the SDK on its cached config.
  const ready = useSuperwall((s) => ({ ok: s.isConfigured })).ok;

  const finish = (c: NonNullable<typeof current.current>) => {
    if (c.done) return;
    c.done = true;
    c.req.run?.();
  };

  const { registerPlacement } = usePlacement({
    onPresent: () => {
      if (current.current) current.current.presented = true;
    },
    onSkip: (reason) => {
      if (current.current) current.current.skip = reason;
    },
    onDismiss: () => {
      // Non-gated: closing the paywall continues, even if the campaign was set to gated by mistake.
      const c = current.current;
      if (c && !c.req.allowed) finish(c);
    },
    onError: () => {
      const c = current.current;
      current.current = null;
      if (c && !c.done) showFallback(c.req);
    },
  });

  return useCallback(
    (req: GateRequest) => {
      if (!ready) {
        showFallback(req);
        return;
      }
      const c = { req, presented: false, skip: null as PaywallSkippedReason | null, done: false };
      current.current = c;
      registerPlacement({
        placement: req.placement,
        params: req.params,
        // Superwall calls this when it grants access: skipped paywall, purchase or restore, or a
        // non-gated paywall closing. https://superwall.com/docs/expo/sdk-reference/hooks/usePlacement
        feature: async () => {
          await refreshTier(getEntitlements);
          if (req.allowed) {
            if (req.allowed()) finish(c);
            else if (!c.presented) showFallback(req); // no paywall shown (e.g. no campaign yet): show ours
            return;
          }
          if (!c.presented && c.skip?.type === 'PlacementNotFound') showFallback(req);
          else finish(c);
        },
      }).catch(() => {
        if (!c.done) showFallback(req);
      });
    },
    [ready, registerPlacement, getEntitlements],
  );
}

const OFFLINE = 'Couldn’t reach the App Store. Check your connection and try again.';

// Store prices, fetched once per launch.
let loadedPrices: Record<string, StorePrice> | null = null;

/** Purchase, restore and localized prices for the native fallback paywall. */
export function useLiveStore(): StoreActions {
  const { purchase, restorePurchases, getEntitlements, products, ready } = useSuperwall((s) => ({
    purchase: s.purchase,
    restorePurchases: s.restorePurchases,
    getEntitlements: s.getEntitlements,
    products: s.products,
    ready: s.isConfigured,
  }));
  const [prices, setPrices] = useState(loadedPrices);
  useEffect(() => {
    if (!ready || loadedPrices) return;
    let alive = true;
    const ids = Object.values(PRODUCT_IDS).flatMap((b) => [b.monthly, b.annual]);
    products(ids)
      .then((list) => {
        const found: Record<string, StorePrice> = {};
        for (const p of list) found[p.productIdentifier] = { price: p.price, localizedPrice: p.localizedPrice, monthlyPrice: p.monthlyPrice };
        loadedPrices = found;
        if (alive) setPrices(found);
      })
      .catch(() => {}); // the paywall keeps its USD prices
    return () => {
      alive = false;
    };
  }, [ready, products]);
  return {
    prices: prices ?? undefined,
    // The module is in this build but Superwall hasn't configured (usually no connection on first launch).
    available: ready,
    unavailableReason: ready ? null : OFFLINE,
    purchase: async (productId) => {
      if (!ready) return 'unavailable';
      try {
        const result = await purchase(productId);
        if (result.type === 'purchased') await refreshTier(getEntitlements);
        return result.type as PurchaseOutcome;
      } catch {
        return 'failed';
      }
    },
    restore: async () => {
      if (!ready) return { ok: false, message: OFFLINE };
      try {
        const result = await restorePurchases();
        if (result.result === 'restored') await refreshTier(getEntitlements);
        return result.result === 'restored' ? { ok: true } : { ok: false, message: result.errorMessage ?? undefined };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
