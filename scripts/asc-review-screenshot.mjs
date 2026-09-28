#!/usr/bin/env node
// Attaches the App Review screenshot (marketing/review/subscription-paywall.png, the in-app purchase screen)
// to each of Tenfold's six subscriptions. Apple keeps a subscription in "Missing Metadata" until it has one.
// Run: node scripts/asc-review-screenshot.mjs   (needs ~/.private_keys/AuthKey_5YX524BBAM.p8)
// Safe to re-run: subscriptions that already have a screenshot are skipped.

import { createSign, createPrivateKey, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY_ID = '5YX524BBAM';
const ISSUER = '8e2cad29-fcba-4f15-baf7-23b9cbcd6c24';
const APP_ID = '6816729918';
const API = 'https://api.appstoreconnect.apple.com';
const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'marketing', 'review', 'subscription-paywall.png');

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
const rel = (type, id) => ({ data: { type, id } });

const buf = readFileSync(FILE);
const checksum = createHash('md5').update(buf).digest('hex');
const groups = (await api('GET', `/v1/apps/${APP_ID}/subscriptionGroups`)).data;
for (const g of groups) {
  const subs = (await api('GET', `/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`)).data;
  for (const sub of subs) {
    const name = sub.attributes.productId;
    try {
      let existing = null;
      try {
        existing = (await api('GET', `/v1/subscriptions/${sub.id}/appStoreReviewScreenshot`)).data;
      } catch { /* none */ }
      if (existing) {
        console.log(`${name}: already has a screenshot`);
        continue;
      }
      const shot = (await api('POST', '/v1/subscriptionAppStoreReviewScreenshots', {
        data: { type: 'subscriptionAppStoreReviewScreenshots', attributes: { fileName: 'tenfold-paywall.png', fileSize: buf.length }, relationships: { subscription: rel('subscriptions', sub.id) } },
      })).data;
      for (const op of shot.attributes.uploadOperations) {
        const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
        const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
        if (!r.ok) throw new Error(`upload part at ${op.offset}: HTTP ${r.status}`);
      }
      await api('PATCH', `/v1/subscriptionAppStoreReviewScreenshots/${shot.id}`, {
        data: { type: 'subscriptionAppStoreReviewScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: checksum } },
      });
      console.log(`${name}: uploaded`);
    } catch (e) {
      console.log(`!! ${name}: ${e.message}`);
    }
  }
}
console.log('Done.');
