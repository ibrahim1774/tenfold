#!/usr/bin/env node
// Updates only the short descriptions of Tenfold's six subscriptions (every localization). No prices.
// 2026-10-05 lineup: Starter 30 exports, Pro 300 exports, Studio unlimited (no 4K or batch sizes, matching the paywall).
// Run: node scripts/asc-descriptions.mjs   (needs ~/.private_keys/AuthKey_5YX524BBAM.p8). Safe to re-run.

import { createSign, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const KEY_ID = '5YX524BBAM';
const ISSUER = '8e2cad29-fcba-4f15-baf7-23b9cbcd6c24';
const APP_ID = '6816729918';
const API = 'https://api.appstoreconnect.apple.com';

// productId → short description (45 chars max)
const DESCRIPTIONS = {
  'com.ibrahim.tenfold.starter.monthly': 'Bulk edit videos, 30 exports a month',
  'com.ibrahim.tenfold.starter.yearly': 'Bulk edit videos, 30 exports a month',
  'com.ibrahim.tenfold.pro.monthly': 'Bulk edit videos, 300 exports a month',
  'com.ibrahim.tenfold.pro.yearly': 'Bulk edit videos, 300 exports a month',
  'com.ibrahim.tenfold.studio.monthly': 'Bulk edit videos, unlimited exports',
  'com.ibrahim.tenfold.studio.yearly': 'Bulk edit videos, unlimited exports',
};
for (const [id, d] of Object.entries(DESCRIPTIONS)) if (d.length > 45) throw new Error(`${id}: description over 45 characters`);

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

const groups = await all(`/v1/apps/${APP_ID}/subscriptionGroups`);
for (const g of groups) {
  const subs = await all(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`);
  for (const sub of subs) {
    const desc = DESCRIPTIONS[sub.attributes.productId];
    if (!desc) continue;
    console.log(`== ${sub.attributes.productId}`);
    try {
      const locs = await all(`/v1/subscriptions/${sub.id}/subscriptionLocalizations`);
      for (const l of locs) {
        if (l.attributes.description === desc) {
          console.log(`   ${l.attributes.locale}: already "${desc}"`);
          continue;
        }
        await api('PATCH', `/v1/subscriptionLocalizations/${l.id}`, { data: { type: 'subscriptionLocalizations', id: l.id, attributes: { description: desc } } });
        console.log(`   ${l.attributes.locale}: ${desc}`);
      }
    } catch (e) {
      console.log(`   !! description: ${e.message}`);
    }
  }
}
console.log('\nDone. Anything marked !! needs a look.');
