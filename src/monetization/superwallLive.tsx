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

import { EV, setTraits, track } from '@/analytics/posthog';
import { logAttributionEvent, setAttributionUser, startAttribution, trackingAnswered } from '@/attribution/appsflyer';
import { PRODUCT_IDS, TIERS } from '@/onboarding/plans';
import { tierOf, useEntitlements } from '@/state/entitlements';
import { useOnboarding } from '@/state/onboarding';
import { useSettings } from '@/state/settings';

import { SUPERWALL_IOS_KEY } from './keys';
import { onboardingAttributes, planFromStatus, productPlan, raisedPlan, type CustomerInfoLike } from './tiers';
import type { GateRequest, PurchaseOutcome, StoreActions, StorePrice } from './types';

const API_KEYS = { ios: SUPERWALL_IOS_KEY };

function onConfigurationError(error: Error) {
  // The app keeps working on the last known tier; gated taps fall back to the native paywall.
  if (__DEV__) console.warn('[Superwall] configuration failed:', error.message);
}

// Superwall's own alert after a restore that finds nothing; our screens don't add a second one.
const OPTIONS = {
  paywalls: {
    restoreFailed: {
      title: 'No subscription found',
      message: 'There’s no active Tenfold subscription on this Apple ID.',
      closeButtonTitle: 'OK',
    },
  },
};

export function LiveProvider({ children }: { children: ReactNode }) {
  return (
    <SuperwallProvider apiKeys={API_KEYS} options={OPTIONS} onConfigurationError={onConfigurationError}>
      <SubscriptionSync />
      <AttributeSync />
      <AttributionBridge />
      {__DEV__ ? <DevEventLogger /> : null}
      {children}
    </SuperwallProvider>
  );
}

/**
 * Superwall's subscription status (and customer info, for the billing period and a product-id fallback)
 * → the persisted plan. Runs on every change, so a purchase, renewal, upgrade, downgrade or expiry applies
 * at once. UNKNOWN keeps the last known plan. The month's export count is never reset here.
 */
function SubscriptionSync() {
  const { subscriptionStatus, customerInfo } = useUser();
  useEffect(() => {
    const s = useEntitlements.getState();
    const next = planFromStatus(subscriptionStatus, customerInfo as CustomerInfoLike, { tier: tierOf(s), billing: s.billing });
    if (s.tier !== next.tier || s.billing !== next.billing || s.isPro !== (next.tier !== 'free')) s.setPlan(next);
  }, [subscriptionStatus, customerInfo]);
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

/** USD list price for a product id, for the revenue value on attribution events. */
function usdPrice(productId: string): number | undefined {
  for (const [tier, ids] of Object.entries(PRODUCT_IDS)) {
    const price = TIERS[tier as keyof typeof TIERS].price;
    if (!price) continue;
    if (ids.monthly === productId) return price.monthly;
    if (ids.annual === productId) return price.annual;
  }
  return undefined;
}

/** Product, plan and price for a trial or purchase event. */
export function purchaseProps(productId: string, source: 'superwall' | 'native') {
  const plan = productPlan(productId);
  return { product: productId, plan: plan?.tier ?? null, billing: plan?.billing ?? null, price_usd: usdPrice(productId) ?? null, source };
}

/**
 * AppsFlyer attribution alongside Superwall: starts it for people past the tracking prompt (new people are
 * asked on onboarding's first tap), links the AppsFlyer id to Superwall and the Superwall user to
 * AppsFlyer, and reports trials and subscriptions as AppsFlyer's standard events.
 */
function AttributionBridge() {
  const onboarded = useSettings((s) => s.onboarded);
  const { user, setIntegrationAttributes } = useUser();
  const userId = user?.appUserId || user?.aliasId || '';
  const linked = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!onboarded && !(await trackingAnswered())) return; // onboarding asks first
      const afId = await startAttribution();
      if (afId) setTraits({ appsflyer_id: afId });
      if (!alive || !afId || linked.current) return;
      linked.current = true;
      setIntegrationAttributes({ appsflyerId: afId }).catch(() => {
        linked.current = false;
      });
    })();
    return () => {
      alive = false;
    };
  }, [onboarded, setIntegrationAttributes]);

  useEffect(() => {
    if (!userId) return;
    setAttributionUser(userId);
    setTraits({ superwall_user_id: userId });
  }, [userId]);

  useSuperwallEvents({
    onSuperwallEvent: (info) => {
      const e = info.event;
      if (e.event === 'freeTrialStart') {
        const id = e.product?.productIdentifier ?? e.product?.id ?? '';
        logAttributionEvent('af_start_trial', { af_content_id: id, af_currency: 'USD', af_price: usdPrice(id) ?? 0 });
        track(EV.trialStarted, purchaseProps(id, 'superwall'));
      } else if (e.event === 'subscriptionStart') {
        const id = e.product?.productIdentifier ?? e.product?.id ?? '';
        logAttributionEvent('af_subscribe', { af_content_id: id, af_currency: 'USD', af_revenue: usdPrice(id) ?? 0 });
        track(EV.subscribed, { ...purchaseProps(id, 'superwall'), $revenue: usdPrice(id) ?? 0 });
      }
    },
    onPaywallPresent: (info) =>
      track(EV.paywallShown, { source: 'superwall', paywall: info.name, placement: info.presentedByEventWithName ?? null }),
    onPaywallDismiss: (info, result) =>
      track(EV.paywallDismissed, {
        source: 'superwall',
        paywall: info.name,
        placement: info.presentedByEventWithName ?? null,
        result: result.type,
      }),
  });
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

type Fetchers = {
  getEntitlements: () => Promise<{ active: { id: string }[] }>;
  getCustomerInfo?: () => Promise<unknown>;
};

/**
 * Raises the local plan from Superwall's entitlements (or active products) right after a purchase or restore,
 * before the status event lands. Never lowers it; SubscriptionSync does that.
 */
async function refreshTier({ getEntitlements, getCustomerInfo }: Fetchers, purchasedProductId?: string) {
  const [ent, info] = await Promise.all([
    getEntitlements().catch(() => ({ active: [] as { id: string }[] })),
    getCustomerInfo ? getCustomerInfo().catch(() => null) : Promise.resolve(null),
  ]);
  const s = useEntitlements.getState();
  const next = raisedPlan(
    { tier: tierOf(s), billing: s.billing },
    { entitlementIds: ent.active.map((e) => e.id), info: info as CustomerInfoLike, purchasedProductId },
  );
  if (next) s.setPlan(next);
}

/** Registers placements through Superwall; see ./superwall.ts `usePaywallGate`. */
export function useLiveGate(): (req: GateRequest) => void {
  const current = useRef<{ req: GateRequest; presented: boolean; skip: PaywallSkippedReason | null; done: boolean } | null>(null);
  const { getEntitlements, getCustomerInfo } = useUser();
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
          await refreshTier({ getEntitlements, getCustomerInfo });
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
    [ready, registerPlacement, getEntitlements, getCustomerInfo],
  );
}

const OFFLINE = 'Couldn’t reach the App Store. Check your connection and try again.';

// Store prices, fetched once per launch.
let loadedPrices: Record<string, StorePrice> | null = null;

/** Purchase, restore and localized prices for the native fallback paywall. */
export function useLiveStore(): StoreActions {
  const { purchase, restorePurchases, getEntitlements, getCustomerInfo, products, ready } = useSuperwall((s) => ({
    purchase: s.purchase,
    restorePurchases: s.restorePurchases,
    getEntitlements: s.getEntitlements,
    getCustomerInfo: s.getCustomerInfo,
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
    restoreAlertShown: true,
    purchase: async (productId) => {
      if (!ready) return 'unavailable';
      try {
        const result = await purchase(productId);
        if (result.type === 'purchased') await refreshTier({ getEntitlements, getCustomerInfo }, productId);
        return result.type as PurchaseOutcome;
      } catch {
        return 'failed';
      }
    },
    restore: async () => {
      if (!ready) return { ok: false, message: OFFLINE };
      try {
        const result = await restorePurchases();
        if (result.result === 'restored') await refreshTier({ getEntitlements, getCustomerInfo });
        return result.result === 'restored' ? { ok: true } : { ok: false, message: result.errorMessage ?? undefined };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
