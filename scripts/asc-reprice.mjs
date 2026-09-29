#!/usr/bin/env node
// Re-prices Tenfold's six subscriptions and updates their short descriptions (2026-09-28 lineup):
//   Starter $9.99/mo, $79.99/yr (30 exports)   Pro $19.99/mo, $159.99/yr (300 exports)
//   Studio $49.99/mo, $399.99/yr (unlimited)
// The subscriptions have never been approved, so the new price applies straight away in every country
// (USA price plus Apple's equalised price for each other territory).
// Run: node scripts/asc-reprice.mjs   (needs ~/.private_keys/AuthKey_5YX524BBAM.p8). Safe to re-run.

import { createSign, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const KEY_ID = '5YX524BBAM';
const ISSUER = '8e2cad29-fcba-4f15-baf7-23b9cbcd6c24';
const APP_ID = '6816729918';
const API = 'https://api.appstoreconnect.apple.com';

// productId → [USA price, short description (45 chars max)]
const PLAN = {
  'com.ibrahim.tenfold.starter.monthly': ['9.99', 'Batches of 20, 30 exports, all styles'],
  'com.ibrahim.tenfold.starter.yearly': ['79.99', 'Batches of 20, 30 exports, all styles'],
  'com.ibrahim.tenfold.pro.monthly': ['19.99', 'Batches of 50, 300 exports, 4K export'],
  'com.ibrahim.tenfold.pro.yearly': ['159.99', 'Batches of 50, 300 exports, 4K export'],
  'com.ibrahim.tenfold.studio.monthly': ['49.99', 'Batches of 100, unlimited exports, 4K'],
  'com.ibrahim.tenfold.studio.yearly': ['399.99', 'Batches of 100, unlimited exports, 4K'],
};

const privateKey = createPrivateKey(readFileSync(`${homedir()}/.private_keys/AuthKey_${KEY_ID}.p8`, 'utf8'));
function token() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({ iss: ISSUER, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' })}`;
  const s = createSign('SHA256');
  s.update(head);
  return `${head}.${s.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
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
    if (!res.ok) throw new Error((json.errors || []).map((e) => `${e.code}: ${e.detail || e.title}`).join(' | ') || `HTTP ${res.status}`);
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

const groups = await all(`/v1/apps/${APP_ID}/subscriptionGroups`);
for (const g of groups) {
  const subs = await all(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`);
  for (const sub of subs) {
    const plan = PLAN[sub.attributes.productId];
    if (!plan) continue;
    const [price, desc] = plan;
    console.log(`== ${sub.attributes.productId} → $${price}`);

    // Description shown on the App Store and in purchase sheets.
    try {
      const locs = await all(`/v1/subscriptions/${sub.id}/subscriptionLocalizations`);
      for (const l of locs) {
        if (l.attributes.description === desc) continue;
        await api('PATCH', `/v1/subscriptionLocalizations/${l.id}`, { data: { type: 'subscriptionLocalizations', id: l.id, attributes: { description: desc } } });
        console.log(`   description: ${desc}`);
      }
    } catch (e) {
      console.log(`   !! description: ${e.message}`);
    }

    // Price: the USA point, then Apple's equalised point in every other territory.
    try {
      const usa = (await all(`/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=USA&limit=8000&fields[subscriptionPricePoints]=customerPrice`)).find(
        (p) => p.attributes.customerPrice === price,
      );
      if (!usa) throw new Error(`no USA price point at ${price}`);
      const equal = await all(`/v1/subscriptionPricePoints/${usa.id}/equalizations?include=territory&limit=200`);
      const points = [{ id: usa.id, territory: 'USA' }].concat(
        equal.map((p) => ({ id: p.id, territory: p.relationships?.territory?.data?.id })).filter((p) => p.territory),
      );
      let done = 0;
      for (const p of points) {
        try {
          await api('POST', '/v1/subscriptionPrices', {
            data: {
              type: 'subscriptionPrices',
              attributes: { preserveCurrentPrice: false },
              relationships: { subscription: rel('subscriptions', sub.id), subscriptionPricePoint: rel('subscriptionPricePoints', p.id), territory: rel('territories', p.territory) },
            },
          });
          done++;
        } catch (e) {
          console.log(`   !! ${p.territory}: ${e.message}`);
        }
      }
      console.log(`   price set in ${done} of ${points.length} countries`);
    } catch (e) {
      console.log(`   !! price: ${e.message}`);
    }
  }
}
console.log('\nDone. Anything marked !! needs a look.');
