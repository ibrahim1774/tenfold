// Entry point for paywalls and subscriptions. Screens import from here, never from expo-superwall.
//
// expo-superwall calls requireNativeModule('SuperwallExpo') when it is imported, which throws in a build
// made before the module was added. So it is only required when the module is present; otherwise the
// app runs on the last known tier and every paywall is the native screen at src/app/paywall.tsx.
import { requireOptionalNativeModule } from 'expo';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import type { GateRequest, StoreActions } from './types';

export type { GateRequest, Placement, PurchaseOutcome, RestoreOutcome, StoreActions, StorePrice } from './types';

/** True when this build includes Superwall's native module. */
export const superwallAvailable = requireOptionalNativeModule('SuperwallExpo') != null;

type Live = typeof import('./superwallLive');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const live: Live | null = superwallAvailable ? (require('./superwallLive') as Live) : null;

function PassThrough({ children }: { children: ReactNode }) {
  return children;
}

/** Wraps the app root: Superwall's provider, subscription → tier sync, attributes and dev event log. */
export const MonetizationProvider: (props: { children: ReactNode }) => ReactNode = live?.LiveProvider ?? PassThrough;

function useFallbackGate(): (req: GateRequest) => void {
  return (req) => router.push(req.fallback ?? { pathname: '/paywall', params: { from: req.placement } });
}

/**
 * Returns `gate(request)`: registers the placement with Superwall, which may present a paywall, and runs
 * `request.run` when access is granted. Without Superwall, or when presenting fails, opens the native paywall.
 * Call it only when the action is blocked (or, for non-gated placements, at the moment they happen).
 */
export const usePaywallGate: () => (req: GateRequest) => void = live?.useLiveGate ?? useFallbackGate;

const UPDATE_NEEDED = 'Purchases need the latest version of Tenfold. Update the app and try again.';

const UNAVAILABLE: StoreActions = {
  available: false,
  unavailableReason: UPDATE_NEEDED,
  purchase: async () => 'unavailable',
  restore: async () => ({ ok: false, message: UPDATE_NEEDED }),
};

function useFallbackStore(): StoreActions {
  return UNAVAILABLE;
}

/** Purchase and restore for the native fallback paywall. */
export const useStoreActions: () => StoreActions = live?.useLiveStore ?? useFallbackStore;
