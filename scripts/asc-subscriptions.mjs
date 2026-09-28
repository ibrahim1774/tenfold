#!/usr/bin/env node
// Finishes Tenfold's App Store subscriptions by talking to the App Store Connect API directly.
// Run from a normal Terminal:
//   node scripts/asc-subscriptions.mjs
// Needs the key file at ~/.private_keys/AuthKey_5YX524BBAM.p8 (never committed). Safe to re-run:
// every step checks what already exists first. Errors print Apple's full detail and the script continues.

import { createSign, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const KEY_ID = '5YX524BBAM';
const ISSUER = '8e2cad29-fcba-4f15-baf7-23b9cbcd6c24';
const KEY_PATH = `${homedir()}/.private_keys/AuthKey_${KEY_ID}.p8`;
const APP_ID = '6816729918';
const GROUP_NAME = 'Tenfold';
const API = 'https://api.appstoreconnect.apple.com';

// name | productId | period | groupLevel | USA price | short description (App Store limit: 45 chars)
const SUBS = [
  ['Starter Monthly', 'com.ibrahim.tenfold.starter.monthly', 'ONE_MONTH', 3, '9.99', 'Batches of 20, 30 exports, all styles'],
  ['Starter Yearly', 'com.ibrahim.tenfold.starter.yearly', 'ONE_YEAR', 3, '79.99', 'Batches of 20, 30 exports, all styles'],
  ['Pro Monthly', 'com.ibrahim.tenfold.pro.monthly', 'ONE_MONTH', 2, '19.99', 'Batches of 50, 100 exports, 4K export'],
  ['Pro Yearly', 'com.ibrahim.tenfold.pro.yearly', 'ONE_YEAR', 2, '159.99', 'Batches of 50, 100 exports, 4K export'],
  ['Studio Monthly', 'com.ibrahim.tenfold.studio.monthly', 'ONE_MONTH', 1, '49.99', 'Batches of 100, unlimited exports, 4K'],
  ['Studio Yearly', 'com.ibrahim.tenfold.studio.yearly', 'ONE_YEAR', 1, '399.99', 'Batches of 100, unlimited exports, 4K'],
];

// ---- auth -------------------------------------------------------------------------------------
const pem = readFileSync(KEY_PATH, 'utf8');
const privateKey = createPrivateKey(pem);
let tokenCache = { value: '', exp: 0 };
function token() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.exp - now > 60) return tokenCache.value;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
  const payload = b64({ iss: ISSUER, iat: now, exp: now + 19 * 60, aud: 'appstoreconnect-v1' });
  const signer = createSign('SHA256');
  signer.update(`${header}.${payload}`);
  const sig = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  tokenCache = { value: `${header}.${payload}.${sig}`, exp: now + 19 * 60 };
  return tokenCache.value;
}

// ---- http -------------------------------------------------------------------------------------
async function api(method, path, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      method,
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const detail = (json.errors || []).map((e) => `${e.code}: ${e.detail || e.title}`).join(' | ') || `HTTP ${res.status}`;
      throw new Error(detail);
    }
    return json;
  }
  throw new Error(`gave up after retries: ${method} ${path}`);
}
async function all(path) {
  let out = [];
  let next = path;
  while (next) {
    const j = await api('GET', next);
    out = out.concat(j.data || []);
    next = j.links?.next || null;
  }
  return out;
}
const rel = (type, id) => ({ data: { type, id } });
const post = (type, attributes, relationships) => api('POST', `/v1/${type}`, { data: { type, attributes, relationships } });
const step = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== undefined) console.log(`   ${label}: ${r}`);
  } catch (e) {
    console.log(`   !! ${label}: ${e.message}`);
  }
};

// ---- main -------------------------------------------------------------------------------------
console.log('== Subscription group');
let groups = await all(`/v1/apps/${APP_ID}/subscriptionGroups?fields[subscriptionGroups]=referenceName`);
let group = groups.find((g) => g.attributes.referenceName === GROUP_NAME);
if (!group) group = (await post('subscriptionGroups', { referenceName: GROUP_NAME }, { app: rel('apps', APP_ID) })).data;
console.log(`group ${group.id}`);
await step('group localisation', async () => {
  const locs = await all(`/v1/subscriptionGroups/${group.id}/subscriptionGroupLocalizations`);
  if (locs.length) return 'exists';
  await post('subscriptionGroupLocalizations', { name: GROUP_NAME, locale: 'en-US' }, { subscriptionGroup: rel('subscriptionGroups', group.id) });
  return 'added';
});

const territories = (await all('/v1/territories?limit=200')).map((t) => t.id);
console.log(`${territories.length} territories`);

for (const [name, productId, period, level, price, desc] of SUBS) {
  console.log(`== ${name} (${productId})`);
  const subs = await all(`/v1/subscriptionGroups/${group.id}/subscriptions?fields[subscriptions]=productId&limit=50`);
  let sub = subs.find((s) => s.attributes.productId === productId);
  if (!sub) {
    sub = (await post('subscriptions', {
      name, productId, subscriptionPeriod: period, groupLevel: level, familySharable: false,
      reviewNote: `Unlocks the Tenfold ${name} tier: ${desc}.`,
    }, { group: rel('subscriptionGroups', group.id) })).data;
    console.log(`   created ${sub.id}`);
  } else console.log(`   exists ${sub.id}`);
  const sid = sub.id;

  await step('localisation', async () => {
    const locs = await all(`/v1/subscriptions/${sid}/subscriptionLocalizations`);
    if (locs.length) return 'exists';
    await post('subscriptionLocalizations', { name: `Tenfold ${name}`.slice(0, 30), locale: 'en-US', description: desc.slice(0, 45) }, { subscription: rel('subscriptions', sid) });
    return 'added';
  });

  await step('availability', async () => {
    try {
      const a = await api('GET', `/v1/subscriptions/${sid}/subscriptionAvailability`);
      if (a.data) return 'exists';
    } catch { /* none yet */ }
    await post('subscriptionAvailabilities', { availableInNewTerritories: true }, {
      subscription: rel('subscriptions', sid),
      availableTerritories: { data: territories.map((id) => ({ type: 'territories', id })) },
    });
    return `all ${territories.length} territories`;
  });

  await step('prices', async () => {
    const existing = await all(`/v1/subscriptions/${sid}/prices?include=territory&limit=200`);
    const priced = new Set(existing.map((p) => p.relationships?.territory?.data?.id).filter(Boolean));
    if (priced.size >= territories.length) return `exists (${priced.size})`;
    const usaPoints = await all(`/v1/subscriptions/${sid}/pricePoints?filter[territory]=USA&limit=8000&fields[subscriptionPricePoints]=customerPrice`);
    const usa = usaPoints.find((p) => p.attributes.customerPrice === price);
    if (!usa) throw new Error(`no USA price point at ${price}`);
    const equal = await all(`/v1/subscriptionPricePoints/${usa.id}/equalizations?include=territory&limit=200`);
    const points = [{ id: usa.id, territory: 'USA' }].concat(
      equal.map((p) => ({ id: p.id, territory: p.relationships?.territory?.data?.id })).filter((p) => p.territory),
    );
    let added = 0;
    for (const p of points) {
      if (priced.has(p.territory)) continue;
      try {
        await post('subscriptionPrices', {}, { subscription: rel('subscriptions', sid), subscriptionPricePoint: rel('subscriptionPricePoints', p.id), territory: rel('territories', p.territory) });
        added++;
      } catch (e) {
        console.log(`      !! price ${p.territory}: ${e.message}`);
      }
    }
    return `${added} territories priced (USA ${price})`;
  });

  await step('3-day free trial', async () => {
    const existing = await all(`/v1/subscriptions/${sid}/introductoryOffers?include=territory&limit=200`);
    const done = new Set(existing.map((o) => o.relationships?.territory?.data?.id).filter(Boolean));
    let added = 0;
    for (const t of territories) {
      if (done.has(t)) continue;
      try {
        await post('subscriptionIntroductoryOffers', { duration: 'THREE_DAYS', offerMode: 'FREE_TRIAL', numberOfPeriods: 1 }, { subscription: rel('subscriptions', sid), territory: rel('territories', t) });
        added++;
      } catch (e) {
        console.log(`      !! offer ${t}: ${e.message}`);
        if (/RELATIONSHIP|ATTRIBUTE/.test(e.message) && added === 0) break; // same error would repeat 175 times
      }
    }
    return `${added} added, ${done.size} existed`;
  });
}

console.log('\nDone. Anything marked !! needs a look. Then check Monetization → Subscriptions in App Store Connect.');
