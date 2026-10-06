import { PaywallView } from '@/paywall/PaywallView';

/** Plans for subscribers (switch plan, raise a limit) and the fallback when Superwall can't present. */
export default function PaywallScreen() {
  return <PaywallView mode="upgrade" />;
}
