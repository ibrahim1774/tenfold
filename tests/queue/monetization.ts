// Tiers, limits and the Superwall → tier mapping. Pure code only: nothing here imports expo-superwall.
import { onboardingAttributes, tierFromEntitlements, tierFromStatus } from '@/monetization/tiers';
import {
  annualSavingPercent,
  annualSavingPill,
  featuresFor,
  limitsFor,
  nextTier,
  planFor,
  PLANS,
  PRODUCT_IDS,
  renewalLine,
  type Tier,
} from '@/onboarding/plans';
import { captionStyleUnlocked, exportLimit, exportsLeft, maxBatchSize, tierOf, TIER_NAMES, useEntitlements } from '@/state/entitlements';
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
    starter: { exports: 100, batch: 20, styles: true, watermark: false, uhd: false },
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
    planFor('starter').price?.monthly === 19.99 && planFor('starter').price?.annual === 159.99 &&
      planFor('pro').price?.monthly === 49.99 && planFor('pro').price?.annual === 399.99 &&
      planFor('studio').price?.monthly === 89.99 && planFor('studio').price?.annual === 719.99,
    'prices match the table',
  );
  check(PRODUCT_IDS.pro.annual === 'com.ibrahim.tenfold.pro.yearly' && PRODUCT_IDS.starter.monthly === 'com.ibrahim.tenfold.starter.monthly', 'product ids');
  check(renewalLine(planFor('pro'), 'annual').startsWith('Free for 3 days, then $399.99 a year.'), `renewal line (${renewalLine(planFor('pro'), 'annual')})`);

  console.log('• monetization: feature lists are written from the table');
  const free = featuresFor('free');
  check(free.includes('3 exports a month') && free.includes('Batches of 10') && free.includes('Small watermark') && free.includes('Free caption styles'), `free (${free.join(', ')})`);
  const starter = featuresFor('starter');
  check(starter.includes('100 exports a month') && starter.includes('Batches of 20') && starter.includes('No watermark') && !starter.includes('4K export'), `starter (${starter.join(', ')})`);
  const pro = featuresFor('pro');
  check(pro.includes('300 exports a month') && pro.includes('Batches of 50') && pro.includes('4K export'), `pro (${pro.join(', ')})`);
  const studio = featuresFor('studio');
  check(studio.includes('Unlimited exports') && studio.includes('Batches of 100') && studio.includes('4K export'), `studio (${studio.join(', ')})`);

  console.log('• monetization: exports left this month for each tier');
  const month = monthKey();
  const left = (tier: Tier, used: number, exportMonth = month) => {
    useEntitlements.setState({ tier, isPro: tier !== 'free', exportsUsed: used, exportMonth });
    return exportsLeft(useEntitlements.getState());
  };
  check(left('free', 0) === 3 && left('free', 2) === 1 && left('free', 3) === 0 && left('free', 9) === 0, 'free: 3 a month, never negative');
  check(left('starter', 0) === 100 && left('starter', 40) === 60 && left('starter', 100) === 0, 'starter: 100 a month');
  check(left('pro', 0) === 300 && left('pro', 299) === 1 && left('pro', 300) === 0, 'pro: 300 a month');
  check(left('studio', 0) === Infinity && left('studio', 5000) === Infinity, 'studio: unlimited');
  check(left('starter', 100, '1999-1') === 100, 'a new month resets the count');
  useEntitlements.setState({ tier: 'free', isPro: true, exportsUsed: 0, exportMonth: month });
  check(exportsLeft(useEntitlements.getState()) === 300, 'legacy isPro: true counts as pro (300)');

  console.log('• monetization: onboarding answers become user attributes, nothing personal');
  const attrs = onboardingAttributes({ role: 'coach', videosPerWeek: '3-5', minutesPerVideo: null }, 'auto');
  check(
    JSON.stringify(attrs) === JSON.stringify({ role: 'coach', videosPerWeek: '3-5', minutesPerVideo: null, language: 'auto' }),
    `attributes (${JSON.stringify(attrs)})`,
  );

  useEntitlements.setState({ tier: 'free', isPro: false, exportsUsed: 0, exportMonth: month });
}
