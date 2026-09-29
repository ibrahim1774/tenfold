#!/usr/bin/env node
// Uploads the five App Store screenshots in marketing/screenshots/out/6.7 to the iPhone 6.9"/6.7"
// slot (API display type APP_IPHONE_67) of the editable App Store version, en-US, then the App Preview
// video marketing/preview/app-preview-6.9.mp4 to the same slot (preview type IPHONE_67).
// Run: node scripts/asc-screenshots.mjs
// Needs ~/.private_keys/AuthKey_5YX524BBAM.p8. Replaces whatever screenshots and previews are already in that slot.

import { createSign, createPrivateKey, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY_ID = '5YX524BBAM';
const ISSUER = '8e2cad29-fcba-4f15-baf7-23b9cbcd6c24';
const APP_ID = '6816729918';
const LOCALE = 'en-US';
const DISPLAY_TYPE = 'APP_IPHONE_67';
const API = 'https://api.appstoreconnect.apple.com';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'marketing', 'screenshots', 'out', '6.7');
const PREVIEW = join(dirname(fileURLToPath(import.meta.url)), '..', 'marketing', 'preview', 'app-preview-6.9.mp4');
const PREVIEW_TYPE = 'IPHONE_67';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Editable version
const versions = (await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20`)).data;
const editable = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
const version = versions.find((v) => editable.includes(v.attributes.appStoreState) || editable.includes(v.attributes.appVersionState)) || versions[0];
if (!version) throw new Error('No App Store version found');
console.log(`version ${version.attributes.versionString} (${version.attributes.appStoreState}) ${version.id}`);

// 2. Localisation
const locs = (await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data;
const loc = locs.find((l) => l.attributes.locale === LOCALE);
if (!loc) throw new Error(`No ${LOCALE} localisation on this version`);

// 3. Screenshot set
const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data;
let set = sets.find((s) => s.attributes.screenshotDisplayType === DISPLAY_TYPE);
if (!set) {
  set = (await api('POST', '/v1/appScreenshotSets', {
    data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: DISPLAY_TYPE }, relationships: { appStoreVersionLocalization: rel('appStoreVersionLocalizations', loc.id) } },
  })).data;
  console.log(`created set ${set.id}`);
} else console.log(`set ${set.id}`);

// 4. Clear the slot
const old = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
for (const s of old) {
  await api('DELETE', `/v1/appScreenshots/${s.id}`);
  console.log(`removed old ${s.attributes.fileName}`);
}

// 5. Upload
const files = readdirSync(DIR).filter((f) => /^0[1-9]\.png$/.test(f)).sort();
const ids = [];
for (const f of files) {
  const buf = readFileSync(join(DIR, f));
  const fileName = `tenfold-${f}`;
  const shot = (await api('POST', '/v1/appScreenshots', {
    data: { type: 'appScreenshots', attributes: { fileName, fileSize: buf.length }, relationships: { appScreenshotSet: rel('appScreenshotSets', set.id) } },
  })).data;
  for (const op of shot.attributes.uploadOperations) {
    const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
    const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
    if (!r.ok) throw new Error(`upload ${f} part at ${op.offset}: HTTP ${r.status}`);
  }
  await api('PATCH', `/v1/appScreenshots/${shot.id}`, {
    data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(buf).digest('hex') } },
  });
  ids.push(shot.id);
  console.log(`uploaded ${f} → ${shot.id}`);
}

// 6. Order and processing state
await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, { data: ids.map((id) => ({ type: 'appScreenshots', id })) });
for (let i = 0; i < 20; i++) {
  const states = await Promise.all(ids.map(async (id) => (await api('GET', `/v1/appScreenshots/${id}`)).data.attributes.assetDeliveryState));
  const summary = states.map((s) => s?.state).join(', ');
  if (states.every((s) => s?.state === 'COMPLETE' || s?.state === 'FAILED')) {
    console.log(`processing: ${summary}`);
    states.forEach((s, n) => s?.errors?.length && console.log(`  !! ${files[n]}: ${s.errors.map((e) => e.description || e.code).join('; ')}`));
    break;
  }
  if (i === 19) console.log(`still processing: ${summary}`);
  await sleep(3000);
}
// 7. App Preview video: same slot, replaces any existing preview
{
  const psets = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appPreviewSets`)).data;
  let pset = psets.find((s) => s.attributes.previewType === PREVIEW_TYPE);
  if (!pset) {
    pset = (await api('POST', '/v1/appPreviewSets', {
      data: { type: 'appPreviewSets', attributes: { previewType: PREVIEW_TYPE }, relationships: { appStoreVersionLocalization: rel('appStoreVersionLocalizations', loc.id) } },
    })).data;
    console.log(`created preview set ${pset.id}`);
  }
  for (const p of (await api('GET', `/v1/appPreviewSets/${pset.id}/appPreviews`)).data) {
    await api('DELETE', `/v1/appPreviews/${p.id}`);
    console.log(`removed old preview ${p.attributes.fileName}`);
  }
  const buf = readFileSync(PREVIEW);
  const prev = (await api('POST', '/v1/appPreviews', {
    data: { type: 'appPreviews', attributes: { fileName: 'tenfold-preview.mp4', fileSize: buf.length, mimeType: 'video/mp4', previewFrameTimeCode: '00:00:05:00' }, relationships: { appPreviewSet: rel('appPreviewSets', pset.id) } },
  })).data;
  for (const op of prev.attributes.uploadOperations) {
    const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
    const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
    if (!r.ok) throw new Error(`upload preview part at ${op.offset}: HTTP ${r.status}`);
  }
  await api('PATCH', `/v1/appPreviews/${prev.id}`, {
    data: { type: 'appPreviews', id: prev.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(buf).digest('hex') } },
  });
  console.log(`uploaded preview → ${prev.id}`);
  for (let i = 0; i < 40; i++) {
    const st = (await api('GET', `/v1/appPreviews/${prev.id}`)).data.attributes.assetDeliveryState;
    if (st?.state === 'COMPLETE' || st?.state === 'FAILED' || i === 39) {
      console.log(`preview processing: ${st?.state}${st?.errors?.length ? ' — ' + st.errors.map((e) => e.description || e.code).join('; ') : ''}`);
      break;
    }
    await sleep(5000);
  }
}
console.log('Done.');
