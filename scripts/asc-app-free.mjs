#!/usr/bin/env node
// Sets Tenfold's App Store price to Free and makes it available in every country (and new ones).
// Run: node scripts/asc-app-free.mjs   (needs ~/.private_keys/AuthKey_5YX524BBAM.p8)

import { createSign, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const KEY_ID = '5YX524BBAM';
const ISSUER = '8e2cad29-fcba-4f15-baf7-23b9cbcd6c24';
const APP_ID = '6816729918';
const API = 'https://api.appstoreconnect.apple.com';

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
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path}: ` + ((json.errors || []).map((e) => `${e.code}: ${e.detail || e.title}`).join(' | ') || res.status));
  return json;
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

// 1. Price: Free, with the USA as the base country (Apple applies it everywhere).
const points = await all(`/v1/apps/${APP_ID}/appPricePoints?filter[territory]=USA&limit=200&fields[appPricePoints]=customerPrice`);
const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
try {
  if (!free) throw new Error('no free price point found');
  await api('POST', '/v1/appPriceSchedules', {
    data: {
      type: 'appPriceSchedules',
      relationships: { app: rel('apps', APP_ID), baseTerritory: rel('territories', 'USA'), manualPrices: { data: [{ type: 'appPrices', id: '${price1}' }] } },
    },
    included: [{ type: 'appPrices', id: '${price1}', attributes: { startDate: null }, relationships: { appPricePoint: rel('appPricePoints', free.id) } }],
  });
  console.log('price: Free');
} catch (e) {
  console.log(`!! price: ${e.message}`);
}

// 2. Availability: every territory, and new territories as Apple adds them.
const territories = (await all('/v1/territories?limit=200')).map((t) => t.id);
try {
  await api('POST', '/v2/appAvailabilities', {
    data: {
      type: 'appAvailabilities',
      attributes: { availableInNewTerritories: true },
      relationships: {
        app: rel('apps', APP_ID),
        territoryAvailabilities: { data: territories.map((_, i) => ({ type: 'territoryAvailabilities', id: `\${t${i}}` })) },
      },
    },
    included: territories.map((t, i) => ({
      type: 'territoryAvailabilities',
      id: `\${t${i}}`,
      attributes: { available: true },
      relationships: { territory: rel('territories', t) },
    })),
  });
  console.log(`availability: all ${territories.length} countries`);
} catch (e) {
  console.log(`!! availability: ${e.message}`);
}
console.log('Done. Anything marked !! can also be set by hand in App Store Connect → Pricing and Availability.');
