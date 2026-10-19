// node review-notes-2026-10-19.mjs [--apply]
// 1. Appends the speech-test paragraph to the version 1.0 App Review notes (keeps the existing text and contact).
// 2. Fixes the subscription review notes: Starter 100 -> 30 exports a month, no "4K export" on Pro/Studio.
// Dry run by default; re-reads everything after --apply.
import {api} from './asc.mjs'; import {readFileSync} from 'node:fs';
const live=JSON.parse(readFileSync(new URL('./live.json', import.meta.url),'utf8'));
const apply=process.argv.includes('--apply');
const ADD="If the device has no videos with speech, tap Record a clip on the Create tab and talk for 20–30 seconds, pausing and saying 'um' a few times, then tap Generate. Captions, filler-word and retake removal use Apple's on-device speech recognition (iOS 26) and work in English, Spanish, French, German, Italian and Portuguese — please test with the device language set to English. Silence removal works in any language.";

const rd=(await api('GET',`/v1/appStoreVersions/${live.versionId}/appStoreReviewDetail`)).json.data;
const notes=rd.attributes.notes||'';
console.log('--- review notes BEFORE ---\n'+notes);
if(notes.includes(ADD)) console.log('(already appended)');
else {
  // Put it before the closing "Support:" line so the contact stays last.
  const i=notes.lastIndexOf('\n\nSupport:');
  const next=i>=0? notes.slice(0,i)+'\n\n'+ADD+notes.slice(i) : notes+'\n\n'+ADD;
  if(next.length>4000) throw new Error('notes over 4000');
  console.log('--- review notes AFTER ---\n'+next);
  if(apply){ const r=await api('PATCH',`/v1/appStoreReviewDetails/${rd.id}`,{data:{type:'appStoreReviewDetails',id:rd.id,attributes:{notes:next}}});
    console.log('PATCH reviewDetail',r.status,r.status>=300?JSON.stringify(r.json?.errors):''); }
}

const subs=(await api('GET','/v1/subscriptionGroups/22418972/subscriptions?limit=50')).json.data;
const fixNote=n=>n.replace('100 exports a month','30 exports a month').replace(/, 4K export(?=\.)/,'');
for(const s of subs){
  const before=s.attributes.reviewNote||'', after=fixNote(before);
  console.log(`${s.attributes.productId}\n  before: ${before}\n  after:  ${after}${after===before?'  (unchanged)':''}`);
  if(apply&&after!==before){ const r=await api('PATCH',`/v1/subscriptions/${s.id}`,{data:{type:'subscriptions',id:s.id,attributes:{reviewNote:after}}});
    console.log('  PATCH',r.status,r.status>=300?JSON.stringify(r.json?.errors):''); }
}
if(apply){
  const n=(await api('GET',`/v1/appStoreReviewDetails/${rd.id}`)).json.data.attributes;
  console.log('verify review notes appended:',n.notes.includes(ADD),'| contact unchanged:',n.contactPhone===rd.attributes.contactPhone&&n.contactEmail===rd.attributes.contactEmail);
  for(const s of (await api('GET','/v1/subscriptionGroups/22418972/subscriptions?limit=50')).json.data)
    console.log('verify',s.attributes.productId,/4K|100 exports/.test(s.attributes.reviewNote)?'STILL WRONG':'ok','|',s.attributes.reviewNote);
}
