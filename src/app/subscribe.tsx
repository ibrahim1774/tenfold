import { PaywallView } from '@/paywall/PaywallView';

/** The hard paywall: where everyone onboarded without a subscription or trial lands, at every launch. */
export default function SubscribeScreen() {
  return <PaywallView mode="gate" />;
}
