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
  /**
   * Where to go when Superwall can't present. Default: the native paywall screen. `'none'`: stay put, for the
   * subscription gate, which is itself the native paywall (pushing another one would stack a duplicate).
   */
  fallback?: Href | 'none';
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
  /** True when the store shows its own alert after a failed restore (Superwall does), so screens don't add a second one. */
  restoreAlertShown?: boolean;
  /** The App Store's prices in the person's currency, by product id, once loaded. Missing ids: not loaded. */
  prices?: Partial<Record<string, StorePrice>>;
  /**
   * `loading` while fetching (or waiting for Superwall), `loaded` once the App Store answered with prices (a
   * product it didn't return isn't sold in this storefront), `failed` when it couldn't be reached.
   */
  pricesStatus: PricesStatus;
  /** Fetches the prices again unless they're all loaded or a fetch is running. Absent when there's no store. */
  reloadPrices?: () => void;
};

export type PricesStatus = 'loading' | 'loaded' | 'failed';

export type StorePrice = {
  price: number;
  /** "$19.99", "19,99 €". */
  localizedPrice: string;
  /** The price spread over a month, in the same currency. */
  monthlyPrice: string;
};
