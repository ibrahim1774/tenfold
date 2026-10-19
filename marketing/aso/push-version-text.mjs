// node push-version-text.mjs [--apply] [locale...]
// Sends ONLY description / keywords / promotionalText that differ from what is live on the version
// (never name/subtitle/URLs/whatsNew, unlike upload.mjs). Without --apply it is a dry run.
// After applying, re-reads every locale and checks all three fields against locales/<loc>.json.
import {api} from './asc.mjs'; import {readFileSync} from 'node:fs';
const live=JSON.parse(readFileSync(new URL('./live.json', import.meta.url),'utf8'));
const apply=process.argv.includes('--apply');
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const FIELDS=['description','keywords','promotionalText'];
const LIM={description:4000,keywords:100,promotionalText:170};
const get=async()=>(await api('GET',`/v1/appStoreVersions/${live.versionId}/appStoreVersionLocalizations?limit=200`)).json.data;
const local=loc=>JSON.parse(readFileSync(new URL(`./locales/${loc}.json`, import.meta.url),'utf8'));
const rows=await get();
let changed=0, failed=0;
for(const r of rows.sort((a,b)=>a.attributes.locale.localeCompare(b.attributes.locale))){
  const loc=r.attributes.locale; if(only.length&&!only.includes(loc)) continue;
  const d=local(loc), attrs={};
  for(const k of FIELDS){ if([...d[k]].length>LIM[k]) throw new Error(`${loc} ${k} over limit`); if(d[k]!==r.attributes[k]) attrs[k]=d[k]; }
  if(!Object.keys(attrs).length){ console.log(loc.padEnd(8),'unchanged'); continue; }
  changed++;
  if(!apply){ console.log(loc.padEnd(8),'would PATCH',Object.keys(attrs).join(',')); continue; }
  const p=await api('PATCH',`/v1/appStoreVersionLocalizations/${r.id}`,{data:{type:'appStoreVersionLocalizations',id:r.id,attributes:attrs}});
  if(p.status>=300){ failed++; console.log(loc.padEnd(8),'PATCH',p.status,JSON.stringify(p.json?.errors?.map(e=>e.detail)).slice(0,300)); }
  else console.log(loc.padEnd(8),'PATCHED',Object.keys(attrs).join(','));
}
console.log(apply?`patched ${changed-failed}/${changed}`:`dry run: ${changed} locales would change`);
if(apply){
  let bad=0; const after=await get();
  for(const r of after){ const loc=r.attributes.locale; if(only.length&&!only.includes(loc)) continue;
    const d=local(loc); const mism=FIELDS.filter(k=>d[k]!==r.attributes[k]);
    if(mism.length){bad++; console.log('VERIFY FAIL',loc,mism.join(','));} }
  console.log(`verify: ${after.length-bad}/${after.length} locales match locales/*.json exactly`);
}
