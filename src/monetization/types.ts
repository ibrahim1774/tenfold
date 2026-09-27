import type { Href } from 'expo-router';

/** Placements registered in code; campaigns in the Superwall dashboard use these exact names. */
export type Placement = 'onboarding_end' | 'export_limit' | 'batch_limit' | 'caption_style_locked' | 'settings_upgrade';

export type GateRequest = {
  placement: Placement;
  params?: Record<string, string | number | boolean>;
  /**
   * Gated placements: whether the person may now do the thing. Checked after the paywall (and after
   * the tier is refreshed), so a skipped paywall never hands out a paid action. Omit for non-gated placements.
   */
  allowed?: () => boolean;
  /** The action, run once when access is granted (non-gated: when the paywall closes or is skipped). */
  run?: () => void;
  /** Where to go when Superwall can't present. Default: the native paywall screen. */
  fallback?: Href;
};

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending' | 'failed' | 'unavailable';
export type RestoreOutcome = { ok: boolean; message?: string };

/** Store actions for the native fallback paywall. */
export type StoreActions = {
  /** False when Superwall isn't running; `unavailableReason` then says why, in words for the person. */
  available: boolean;
  unavailableReason: string | null;
  purchase: (productId: string) => Promise<PurchaseOutcome>;
  restore: () => Promise<RestoreOutcome>;
};
