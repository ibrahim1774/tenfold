// Why the subscription gate is showing, for paywall analytics: straight after onboarding, or at a later launch.
let source: 'onboarding' | 'launch' = 'launch';

/** Onboarding just finished: the gate's next paywall is the end-of-onboarding one. */
export function markOnboardingFinished() {
  source = 'onboarding';
}

/** Read once by the gate when it presents; later presentations in this run count as launches. */
export function takeGateSource(): 'onboarding' | 'launch' {
  const s = source;
  source = 'launch';
  return s;
}
