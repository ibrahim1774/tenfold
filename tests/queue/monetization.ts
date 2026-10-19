// Tiers, limits and the Superwall → tier mapping. Pure code only: nothing here imports expo-superwall.
import {
  activeProductIds,
  billingFor,
  entitlementTier,
  onboardingAttributes,
  planFromStatus,
  productPlan,
  raisedPlan,
  tierFromEntitlements,
  tierFromProductIds,
  tierFromStatus,
  trackingAtConfigure,
  trackingCanTurnOn,
  type CustomerInfoLike,
  type PlanState,
} from '@/monetization/tiers';
import {
  annualSavingPercent,
  annualSavingPill,
  changeStartsAtRenewal,
  ctaTitle,
  featuresFor,
  limitsFor,
  nextTier,
  planFor,
  PLANS,
  priceLine,
  PRODUCT_IDS,
  renewalChangeNote,
  renewalLine,
  storeAnnualSaving,
  trialShown,
  type Tier,
} from '@/onboarding/plans';
import {
  canExport,
  captionStyleUnlocked,
  hasAccess,
  exportLimit,
  exportsLeft,
  exportUsageLine,
  maxBatchSize,
  planLabel,
  tierOf,
  TIER_NAMES,
  useEntitlements,
} from '@/state/entitlements';
import kv from './kvMock';

type Check = (c: boolean, m: string) => void;

const monthKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}`;

export function runMonetizationTests(check: Check) {
  console.log('• monetization: entitlements → tier (studio > pro > starter > free)');
  check(tierFromEntitlements(['studio', 'pro', 'starter']) === 'studio', 'studio wins over pro and starter');
  check(tierFromEntitlements(['starter', 'pro']) === 'pro', 'pro wins over starter');
  check(tierFromEntitlements(['starter']) === 'starter', 'starter alone');
  check(tierFromEntitlements([]) === 'free', 'no entitlements → free');
  check(tierFromEntitlements(['something_else']) === 'free', 'unknown entitlement → free');
  check(tierFromStatus({ status: 'ACTIVE', entitlements: [{ id: 'pro' }, { id: 'starter' }] }, 'free') === 'pro', 'ACTIVE status maps its entitlements');
  check(tierFromStatus({ status: 'ACTIVE', entitlements: [] }, 'studio') === 'free', 'ACTIVE with no known entitlement → free');
  check(tierFromStatus({ status: 'INACTIVE' }, 'studio') === 'free', 'INACTIVE → free (clears a stale tier)');

  console.log('• monetization: Superwall unavailable keeps the persisted tier');
  const ent = useEntitlements.getState();
  ent.setTier('pro');
  const saved = JSON.parse(kv.getItemSync('tenfold.entitlements') ?? '{}');
  check(saved.state?.tier === 'pro' && saved.state?.isPro === true, `tier persisted (${JSON.stringify(saved.state)})`);
  const last = tierOf(useEntitlements.getState());
  check(tierFromStatus(undefined, last) === 'pro', 'no status (module missing) → last known tier');
  check(tierFromStatus(null, last) === 'pro', 'null status → last known tier');
  check(tierFromStatus({ status: 'UNKNOWN' }, last) === 'pro', 'UNKNOWN (offline, not configured) → last known tier');
  check(tierFromStatus({ status: 'UNKNOWN' }, 'free') === 'free', 'UNKNOWN keeps free as free');

  console.log('• monetization: limits per tier come from the table');
  const expect: Record<Tier, { exports: number; batch: number; styles: boolean; watermark: boolean; uhd: boolean }> = {
    free: { exports: 3, batch: 10, styles: false, watermark: true, uhd: false },
    starter: { exports: 30, batch: 20, styles: true, watermark: false, uhd: false },
    pro: { exports: 300, batch: 50, styles: true, watermark: false, uhd: true },
    studio: { exports: Infinity, batch: 100, styles: true, watermark: false, uhd: true },
  };
  for (const tier of Object.keys(expect) as Tier[]) {
    const e = expect[tier];
    const l = limitsFor(tier);
    check(
      l.exportsPerMonth === e.exports && l.batchSize === e.batch && l.allCaptionStyles === e.styles && l.watermark === e.watermark && l.uhd === e.uhd,
      `${tier} limits (${JSON.stringify(l)})`,
    );
    check(maxBatchSize(tier) === e.batch && exportLimit(tier) === e.exports, `${tier}: entitlements read the table`);
    check(captionStyleUnlocked(tier, true) && captionStyleUnlocked(tier, false) === e.styles, `${tier}: caption styles`);
  }
  check(maxBatchSize(true) === 50 && maxBatchSize(false) === 10, 'legacy boolean: true = pro, false = free');
  check(TIER_NAMES.free === 'Free' && TIER_NAMES.starter === 'Starter', 'free is called Free; Starter is paid');
  check(nextTier('free') === 'starter' && nextTier('pro') === 'studio' && nextTier('studio') === null, 'next tier up');

  console.log('• monetization: prices, yearly saving 33% on every plan, products');
  check(PLANS.length === 3 && PLANS.every((p) => annualSavingPercent(p) === 33), `every plan saves 33% (${PLANS.map(annualSavingPercent).join(', ')})`);
  check(annualSavingPill() === 33, 'the Annual toggle shows 33%');
  check(
    planFor('starter').price?.monthly === 9.99 && planFor('starter').price?.annual === 79.99 &&
      planFor('pro').price?.monthly === 19.99 && planFor('pro').price?.annual === 159.99 &&
      planFor('studio').price?.monthly === 49.99 && planFor('studio').price?.annual === 399.99,
    'prices match the table',
  );
  check(PRODUCT_IDS.pro.annual === 'com.ibrahim.tenfold.pro.yearly' && PRODUCT_IDS.starter.monthly === 'com.ibrahim.tenfold.starter.monthly', 'product ids');
  runPaywallCopyTests(check);

  console.log('• monetization: feature lists are written from the table (no batch size, watermark or 4K advertised)');
  const free = featuresFor('free');
  check(free[0] === '3 exports a month' && free.includes('Free caption styles'), `free (${free.join(', ')})`);
  const starter = featuresFor('starter');
  check(starter[0] === '30 exports a month' && starter.includes('All caption styles'), `starter (${starter.join(', ')})`);
  const pro = featuresFor('pro');
  check(pro[0] === '300 exports a month', `pro (${pro.join(', ')})`);
  const studio = featuresFor('studio');
  check(studio[0] === 'Unlimited exports', `studio card fact is its exports (${studio.join(', ')})`);
  for (const t of ['free', 'starter', 'pro', 'studio'] as const) {
    const lines = featuresFor(t).join(' | ');
    check(!/batch|watermark|4K/i.test(lines), `${t}: nothing about batches, watermark or 4K (${lines})`);
  }

  console.log('• monetization: exports left this month for each tier');
  const month = monthKey();
  const left = (tier: Tier, used: number, exportMonth = month) => {
    useEntitlements.setState({ tier, isPro: tier !== 'free', exportsUsed: used, exportMonth });
    return exportsLeft(useEntitlements.getState());
  };
  check(left('free', 0) === 3 && left('free', 2) === 1 && left('free', 3) === 0 && left('free', 9) === 0, 'free: 3 a month, never negative');
  check(left('starter', 0) === 30 && left('starter', 12) === 18 && left('starter', 30) === 0, 'starter: 30 a month');
  check(left('pro', 0) === 300 && left('pro', 299) === 1 && left('pro', 300) === 0 && left('pro', 301) === 0, 'pro: 300 a month');
  check(left('studio', 0) === Infinity && left('studio', 5000) === Infinity, 'studio: unlimited');
  check(left('starter', 30, '1999-1') === 30, 'a new month resets the count');
  useEntitlements.setState({ tier: 'free', isPro: true, exportsUsed: 0, exportMonth: month });
  check(exportsLeft(useEntitlements.getState()) === 300, 'legacy isPro: true counts as pro (300)');

  console.log('• monetization: onboarding answers become user attributes, nothing personal');
  const attrs = onboardingAttributes({ role: 'coach', videosPerWeek: '3-5', minutesPerVideo: null }, 'auto');
  check(
    JSON.stringify(attrs) === JSON.stringify({ role: 'coach', videosPerWeek: '3-5', minutesPerVideo: null, language: 'auto' }),
    `attributes (${JSON.stringify(attrs)})`,
  );

  console.log('• monetization: Superwall tracking is off until the install match can no longer run');
  check(trackingAtConfigure(false) === 'none', 'new install (not onboarded): configure with none (no install match before ATT)');
  check(trackingAtConfigure(true) === 'all', 'onboarded launch: configure with all');
  check(!trackingCanTurnOn({ configured: false, trackingAnswered: true, onboarded: true }), 'never before configure completes');
  check(!trackingCanTurnOn({ configured: true, trackingAnswered: false, onboarded: false }), 'not before the tracking prompt or the end of onboarding');
  check(trackingCanTurnOn({ configured: true, trackingAnswered: true, onboarded: false }), 'after the tracking prompt (either answer)');
  check(trackingCanTurnOn({ configured: true, trackingAnswered: false, onboarded: true }), 'after onboarding, in a build that never asks');

  runPlanMappingTests(check);
  useEntitlements.setState({ tier: 'free', isPro: false, billing: null, exportsUsed: 0, exportMonth: month });
}

/** The native paywall's price and trial copy (guideline 3.1.2(c)). */
function runPaywallCopyTests(check: Check) {
  console.log('• paywall: billed price leads, trial only when StoreKit says eligible, never USD');
  check(priceLine('annual', '$159.99') === '$159.99 a year' && priceLine('monthly', '19,99 €') === '19,99 € a month', 'billed line uses the App Store’s text');
  const withTrial = renewalLine('annual', '$159.99', true);
  check(withTrial.startsWith('Free for 3 days, then $159.99 a year. Renews automatically'), `renewal line with trial (${withTrial})`);
  const noTrial = renewalLine('monthly', '£19.99', false);
  check(noTrial.startsWith('£19.99 a month. Renews automatically') && !/free/i.test(noTrial), `renewal line without trial (${noTrial})`);
  check(renewalLine('annual', '$159.99', true, 7).startsWith('Free for 7 days'), 'trial length from StoreKit when known');
  check(/cancel in Settings/.test(noTrial), 'disclosure says how to cancel');

  check(trialShown(planFor('pro'), { freeTrial: true }) && trialShown(planFor('studio'), { freeTrial: true }), 'eligible Pro/Studio: trial shown');
  check(!trialShown(planFor('starter'), { freeTrial: true }), 'Starter never shows a trial');
  check(!trialShown(planFor('pro'), { freeTrial: false }), 'lapsed subscriber (not eligible): no trial');
  check(!trialShown(planFor('pro'), null) && !trialShown(planFor('pro'), undefined), 'eligibility unknown or failed: no trial');

  for (const t of ['starter', 'pro', 'studio'] as const) {
    for (const cur of ['free', 'starter', 'pro', 'studio'] as const) {
      const title = ctaTitle(cur, cur === 'free' ? null : 'monthly', t, 'annual');
      check(!/free|trial|day/i.test(title), `button has no trial wording (${cur} → ${t}: "${title}")`);
    }
  }
  check(ctaTitle('free', null, 'pro', 'annual') === 'Get Pro', 'gate button: Get Pro');
  check(ctaTitle('pro', 'annual', 'pro', 'annual') === 'Keep Pro' && ctaTitle('pro', null, 'pro', 'monthly') === 'Keep Pro', 'own plan: Keep');
  check(ctaTitle('pro', 'monthly', 'pro', 'annual') === 'Switch to Pro Annual' && ctaTitle('pro', 'annual', 'studio', 'annual') === 'Switch to Studio', 'switching');

  const prices = (entries: [string, number][]) => Object.fromEntries(entries.map(([id, price]) => [id, { price }]));
  check(storeAnnualSaving(undefined) === null && storeAnnualSaving({}) === null, 'no prices: no saving pill');
  const all = prices(PLANS.flatMap((p) => [[PRODUCT_IDS[p.tier as 'pro'].monthly, p.price!.monthly], [PRODUCT_IDS[p.tier as 'pro'].annual, p.price!.annual]] as [string, number][]));
  check(storeAnnualSaving(all) === 33, `all six: 33% (${storeAnnualSaving(all)})`);
  // A storefront without Studio Monthly (BGR, MDA in 2026-10): the saving from the plans that have both prices.
  const { [PRODUCT_IDS.studio.monthly]: _gone, ...partial } = all;
  check(storeAnnualSaving(partial) === 33, 'a missing product is skipped, not a dead end');
  check(storeAnnualSaving(prices([[PRODUCT_IDS.pro.monthly, 10], [PRODUCT_IDS.pro.annual, 60]])) === 50, 'saving from the store’s own numbers');

  console.log('• paywall: downgrades and monthly ↔ annual start at the next renewal');
  check(changeStartsAtRenewal('pro', 'monthly', 'starter', 'monthly') && changeStartsAtRenewal('studio', 'annual', 'pro', 'annual'), 'downgrade → next renewal');
  check(changeStartsAtRenewal('pro', 'monthly', 'pro', 'annual') && changeStartsAtRenewal('pro', 'annual', 'pro', 'monthly'), 'same plan, other billing → next renewal');
  check(!changeStartsAtRenewal('starter', 'monthly', 'pro', 'monthly') && !changeStartsAtRenewal('pro', 'annual', 'studio', 'monthly'), 'upgrade → now');
  check(!changeStartsAtRenewal('free', null, 'starter', 'monthly') && !changeStartsAtRenewal('pro', null, 'pro', 'annual'), 'first purchase, or billing unknown → now');
  check(renewalChangeNote('pro', 'starter', 'monthly') === 'Done. Starter Monthly starts at your next renewal. You keep Pro until then.', renewalChangeNote('pro', 'starter', 'monthly'));
  check(renewalChangeNote('pro', 'pro', 'annual') === 'Done. Pro Annual starts at your next renewal.', renewalChangeNote('pro', 'pro', 'annual'));
}

const sub = (productId: string, extra: Partial<{ isActive: boolean; isRevoked: boolean; purchaseDate: string }> = {}) => ({
  productId,
  isActive: true,
  isRevoked: false,
  purchaseDate: '2026-09-01T10:00:00Z',
  ...extra,
});
const info = (...subs: ReturnType<typeof sub>[]): CustomerInfoLike => ({ subscriptions: subs });
const active = (...ids: string[]) => ({ status: 'ACTIVE' as const, entitlements: ids.map((id) => ({ id })) });

/** Superwall status / products → plan, and what the plan then allows. */
function runPlanMappingTests(check: Check) {
  const month = monthKey();
  const FREE: PlanState = { tier: 'free', billing: null };

  console.log('• monetization: each of the six products → its tier, billing and limits');
  const six: [string, Tier, 'monthly' | 'annual', { exports: number; batch: number; uhd: boolean }][] = [
    ['com.ibrahim.tenfold.starter.monthly', 'starter', 'monthly', { exports: 30, batch: 20, uhd: false }],
    ['com.ibrahim.tenfold.starter.yearly', 'starter', 'annual', { exports: 30, batch: 20, uhd: false }],
    ['com.ibrahim.tenfold.pro.monthly', 'pro', 'monthly', { exports: 300, batch: 50, uhd: true }],
    ['com.ibrahim.tenfold.pro.yearly', 'pro', 'annual', { exports: 300, batch: 50, uhd: true }],
    ['com.ibrahim.tenfold.studio.monthly', 'studio', 'monthly', { exports: Infinity, batch: 100, uhd: true }],
    ['com.ibrahim.tenfold.studio.yearly', 'studio', 'annual', { exports: Infinity, batch: 100, uhd: true }],
  ];
  for (const [id, tier, billing, lim] of six) {
    const p = productPlan(id);
    check(p?.tier === tier && p.billing === billing, `${id} → ${tier} ${billing} (${JSON.stringify(p)})`);
    check(PRODUCT_IDS[tier as 'pro'][billing] === id, `${id} is the table's ${tier} ${billing} product`);
    // Entitlement named as in the dashboard, plus the product in customer info.
    const plan = planFromStatus(active(tier), info(sub(id)), FREE);
    check(plan.tier === tier && plan.billing === billing, `status ACTIVE [${tier}] + ${id} → ${JSON.stringify(plan)}`);
    // Entitlement missing or renamed: the product id alone decides.
    const byProduct = planFromStatus(active('premium_access'), info(sub(id)), FREE);
    check(byProduct.tier === tier && byProduct.billing === billing, `unknown entitlement, product ${id} → ${JSON.stringify(byProduct)}`);
    useEntitlements.getState().setPlan(plan);
    const s = useEntitlements.getState();
    const l = limitsFor(tierOf(s));
    check(
      s.isPro && exportLimit(tierOf(s)) === lim.exports && maxBatchSize(tierOf(s)) === lim.batch && l.uhd === lim.uhd && !l.watermark && l.allCaptionStyles,
      `${id}: limits applied (${JSON.stringify(l)})`,
    );
    check(captionStyleUnlocked(tierOf(s), false), `${id}: every caption style`);
  }
  check(productPlan('com.ibrahim.tenfold.pro.weekly') === null && productPlan('') === null, 'unknown product → null');
  check(tierFromProductIds(['com.ibrahim.tenfold.starter.monthly', 'com.ibrahim.tenfold.studio.yearly']) === 'studio', 'highest product wins');

  console.log('• monetization: entitlement names (as set in Superwall) → tiers');
  check(entitlementTier('pro') === 'pro' && entitlementTier('Pro') === 'pro' && entitlementTier(' STUDIO ') === 'studio', 'case and spaces ignored');
  check(entitlementTier('starter') === 'starter' && entitlementTier('premium') === null && entitlementTier('product') === null, 'exact ids only, no substring matches');
  check(tierFromEntitlements(['Starter', 'PRO']) === 'pro', 'mixed-case ids still pick the highest');
  check(
    planFromStatus(active('pro'), info(sub('com.ibrahim.tenfold.starter.monthly')), FREE).tier === 'pro',
    'entitlements win over a stale product in customer info',
  );
  check(planFromStatus(active('pro'), null, FREE).billing === null, 'billing unknown without customer info');
  check(planFromStatus(active('pro'), null, { tier: 'pro', billing: 'annual' }).billing === 'annual', 'same tier keeps the known billing');
  check(planFromStatus(active(), info(), FREE).tier === 'free', 'ACTIVE with nothing Tenfold → free');
  check(
    planFromStatus(active(), info(sub('com.ibrahim.tenfold.pro.monthly', { isActive: false })), FREE).tier === 'free',
    'an inactive product grants nothing',
  );
  check(
    planFromStatus(active(), info(sub('com.ibrahim.tenfold.pro.monthly', { isRevoked: true })), FREE).tier === 'free',
    'a revoked (refunded) product grants nothing',
  );
  check(
    billingFor('pro', info(sub('com.ibrahim.tenfold.pro.monthly', { purchaseDate: '2026-08-01T00:00:00Z' }), sub('com.ibrahim.tenfold.pro.yearly'))) === 'annual',
    'billing comes from the newest purchase of the tier (monthly → annual switch)',
  );
  check(activeProductIds(info(sub('a', { isActive: false }), sub('b'))).join() === 'b', 'only active products count');
  check(tierFromStatus(active('studio'), 'free') === 'studio', 'tierFromStatus still works without customer info');

  console.log('• monetization: upgrade Starter → Pro mid-month raises the cap and keeps the month’s count');
  useEntitlements.setState({ tier: 'starter', isPro: true, billing: 'monthly', exportsUsed: 30, exportMonth: month });
  check(exportsLeft(useEntitlements.getState()) === 0, 'starter at 30 of 30: none left');
  const up = planFromStatus(active('pro'), info(sub('com.ibrahim.tenfold.pro.monthly')), { tier: 'starter', billing: 'monthly' });
  useEntitlements.getState().setPlan(up);
  let s = useEntitlements.getState();
  check(s.tier === 'pro' && s.billing === 'monthly', `now pro monthly (${s.tier} ${s.billing})`);
  check(s.exportsUsed === 30 && s.exportMonth === month, `used count kept (${s.exportsUsed})`);
  check(exportsLeft(s) === 270, `270 of 300 left (${exportsLeft(s)})`);
  check(maxBatchSize(tierOf(s)) === 50 && limitsFor(tierOf(s)).uhd, 'batches of 50 and 4K straight away');
  const today = new Date(2026, 8, 29);
  useEntitlements.setState({ exportMonth: monthKey(today) });
  check(
    exportUsageLine(useEntitlements.getState(), today, 'en-US') === '30 of 300 exports used · 270 left · resets Oct 1',
    `usage line (${exportUsageLine(useEntitlements.getState(), today, 'en-US')})`,
  );

  console.log('• monetization: downgrade Pro → Starter keeps the count, caps what is left');
  useEntitlements.setState({ tier: 'pro', isPro: true, billing: 'annual', exportsUsed: 50, exportMonth: month });
  useEntitlements.getState().setPlan(planFromStatus(active('starter'), info(sub('com.ibrahim.tenfold.starter.yearly')), { tier: 'pro', billing: 'annual' }));
  s = useEntitlements.getState();
  check(s.tier === 'starter' && s.billing === 'annual' && s.exportsUsed === 50, `starter annual, 50 used kept (${s.tier} ${s.billing} ${s.exportsUsed})`);
  check(exportsLeft(s) === 0 && maxBatchSize(tierOf(s)) === 20 && !limitsFor(tierOf(s)).uhd, 'starter: none left, batches of 20, no 4K');
  useEntitlements.setState({ exportMonth: monthKey(today) });
  check(
    exportUsageLine(useEntitlements.getState(), today, 'en-US') === '30 of 30 exports used · 0 left · resets Oct 1',
    `over the new cap reads as full (${exportUsageLine(useEntitlements.getState(), today, 'en-US')})`,
  );

  console.log('• monetization: Pro 300 cap and Studio unlimited');
  useEntitlements.setState({ tier: 'pro', isPro: true, exportsUsed: 299, exportMonth: month });
  check(exportsLeft(useEntitlements.getState()) === 1, 'the 300th export is allowed');
  useEntitlements.getState().recordExport();
  check(exportsLeft(useEntitlements.getState()) === 0, 'after 300, the 301st is blocked');
  useEntitlements.setState({ tier: 'studio', isPro: true, exportsUsed: 100_000, exportMonth: month });
  check(exportsLeft(useEntitlements.getState()) === Infinity, 'studio: never blocks, however many');
  check(exportUsageLine(useEntitlements.getState()) === 'Unlimited exports', 'studio usage reads "Unlimited exports"');

  console.log('• monetization: expiry falls back to Free');
  useEntitlements.setState({ tier: 'pro', isPro: true, billing: 'annual', exportsUsed: 2, exportMonth: month });
  const expired = planFromStatus({ status: 'INACTIVE' }, info(sub('com.ibrahim.tenfold.pro.yearly', { isActive: false })), { tier: 'pro', billing: 'annual' });
  useEntitlements.getState().setPlan(expired);
  s = useEntitlements.getState();
  const fl = limitsFor(tierOf(s));
  check(s.tier === 'free' && !s.isPro && s.billing === null, `free, no billing (${JSON.stringify({ tier: s.tier, billing: s.billing })})`);
  check(exportLimit(tierOf(s)) === 3 && exportsLeft(s) === 1 && fl.watermark && !fl.uhd && !fl.allCaptionStyles, 'free: 3 exports, watermark, no 4K, free styles only');
  check(maxBatchSize(tierOf(s)) === 10, 'free: batches of 10');
  check(planFromStatus(active(), info(), { tier: 'studio', billing: 'monthly' }).tier === 'free', 'ACTIVE with no Tenfold entitlement also clears a paid tier');
  check(planFromStatus({ status: 'UNKNOWN' }, null, { tier: 'pro', billing: 'annual' }).billing === 'annual', 'UNKNOWN keeps tier and billing');

  console.log('• monetization: hard paywall — only an active subscription or trial gets in');
  check(!hasAccess({ tier: 'free', isPro: false }), 'no subscription: no access');
  for (const t of ['starter', 'pro', 'studio'] as const) check(hasAccess({ tier: t, isPro: true }), `${t}: access`);
  check(!hasAccess(s), 'expired (INACTIVE after Pro): locked again');
  check(!canExport(s), 'expired: no exports, even with Free’s monthly allowance unused');
  check(hasAccess({ tier: planFromStatus({ status: 'UNKNOWN' }, null, { tier: 'pro', billing: 'annual' }).tier, isPro: true }), 'UNKNOWN (offline) keeps a known subscriber in');
  check(!hasAccess({ tier: planFromStatus({ status: 'UNKNOWN' }, null, { tier: 'free', billing: null }).tier, isPro: false }), 'UNKNOWN never lets a non-subscriber in');
  check(hasAccess({ tier: planFromStatus(active('pro'), info(sub('com.ibrahim.tenfold.pro.monthly')), { tier: 'free', billing: null }).tier, isPro: true }), 'reinstall: ACTIVE status from Superwall lets the subscriber in');
  check(
    hasAccess({ tier: raisedPlan({ tier: 'free', billing: null }, { entitlementIds: ['pro'] })?.tier ?? 'free', isPro: true }),
    'restore on the gate: restored entitlement lets the subscriber in',
  );
  check(!canExport({ tier: 'starter', isPro: true, exportMonth: month, exportsUsed: 30 }) && canExport({ tier: 'starter', isPro: true, exportMonth: month, exportsUsed: 29 }), 'subscribers still have their plan’s monthly cap');

  console.log('• monetization: batch size per tier');
  const batch: Record<Tier, number> = { free: 10, starter: 20, pro: 50, studio: 100 };
  for (const t of Object.keys(batch) as Tier[]) {
    useEntitlements.getState().setPlan({ tier: t, billing: t === 'free' ? null : 'monthly' });
    check(maxBatchSize(tierOf(useEntitlements.getState())) === batch[t], `${t}: batches of ${batch[t]}`);
  }

  console.log('• monetization: purchase / restore raises the plan, never lowers it');
  const cur = (tier: Tier, billing: PlanState['billing'] = null): PlanState => ({ tier, billing });
  check(JSON.stringify(raisedPlan(cur('free'), { entitlementIds: ['pro'], info: info(sub('com.ibrahim.tenfold.pro.yearly')) })) === JSON.stringify({ tier: 'pro', billing: 'annual' }), 'restore: free → pro annual');
  check(JSON.stringify(raisedPlan(cur('free'), { entitlementIds: [], purchasedProductId: 'com.ibrahim.tenfold.studio.monthly' })) === JSON.stringify({ tier: 'studio', billing: 'monthly' }), 'purchase before entitlements land: the bought product decides');
  check(JSON.stringify(raisedPlan(cur('starter', 'monthly'), { entitlementIds: ['pro'], purchasedProductId: 'com.ibrahim.tenfold.pro.monthly' })) === JSON.stringify({ tier: 'pro', billing: 'monthly' }), 'upgrade starter → pro');
  check(JSON.stringify(raisedPlan(cur('pro', 'monthly'), { entitlementIds: ['pro'], purchasedProductId: 'com.ibrahim.tenfold.pro.yearly' })) === JSON.stringify({ tier: 'pro', billing: 'annual' }), 'pro monthly → pro annual');
  check(raisedPlan(cur('pro', 'annual'), { entitlementIds: ['starter'] }) === null, 'a lower result never lowers the plan');
  check(raisedPlan(cur('pro', 'annual'), { entitlementIds: [] }) === null, 'nothing restored: plan left alone');
  check(raisedPlan(cur('pro', 'annual'), { entitlementIds: ['pro'], info: info(sub('com.ibrahim.tenfold.pro.yearly')) }) === null, 'same plan: no change');

  // Restore sets the tier in the store, as superwallLive's refresh does.
  useEntitlements.setState({ tier: 'free', isPro: false, billing: null, exportsUsed: 1, exportMonth: month });
  const st = useEntitlements.getState();
  const restored = raisedPlan({ tier: tierOf(st), billing: st.billing }, { entitlementIds: ['studio'], info: info(sub('com.ibrahim.tenfold.studio.yearly')) });
  if (restored) st.setPlan(restored);
  s = useEntitlements.getState();
  check(s.tier === 'studio' && s.billing === 'annual' && s.isPro && s.exportsUsed === 1, `restore: studio annual set, count kept (${s.tier} ${s.billing} ${s.exportsUsed})`);
  const saved = JSON.parse(kv.getItemSync('tenfold.entitlements') ?? '{}');
  check(saved.state?.tier === 'studio' && saved.state?.billing === 'annual', `restored plan persisted (${JSON.stringify(saved.state)})`);
  check(planLabel('studio', 'annual') === 'Studio · Annual' && planLabel('pro', null) === 'Pro' && planLabel('free', null) === 'Free', 'plan label');
}
