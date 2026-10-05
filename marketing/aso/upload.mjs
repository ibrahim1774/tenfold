// node upload.mjs <locale> [<locale>...]  — writes name/subtitle/privacy URL (appInfo) and description/keywords/promo/URLs (version), then reads back.
import {api,APP} from './asc.mjs'; import {readFileSync} from 'node:fs';
const live=JSON.parse(readFileSync(new URL('./live.json', import.meta.url),'utf8'));
const SITE='https://ibrahim1774.github.io/tenfold/';
const PRIV='https://ibrahim1774.github.io/tenfold/privacy.html';
const infoLocs=(await api('GET',`/v1/appInfos/${live.appInfoId}/appInfoLocalizations?limit=200`)).json.data;
const verLocs=(await api('GET',`/v1/appStoreVersions/${live.versionId}/appStoreVersionLocalizations?limit=200`)).json.data;
for(const loc of process.argv.slice(2)){
  const d=JSON.parse(readFileSync(new URL(`./locales/${loc}.json`, import.meta.url),'utf8'));
  const msgs=[];
  // app info (name, subtitle)
  const ia={name:d.name,subtitle:d.subtitle,privacyPolicyUrl:PRIV};
  let il=infoLocs.find(x=>x.attributes.locale===loc), r;
  if(il) r=await api('PATCH',`/v1/appInfoLocalizations/${il.id}`,{data:{type:'appInfoLocalizations',id:il.id,attributes:ia}});
  else r=await api('POST','/v1/appInfoLocalizations',{data:{type:'appInfoLocalizations',attributes:{locale:loc,...ia},relationships:{appInfo:{data:{type:'appInfos',id:live.appInfoId}}}}});
  if(r.status>=300) msgs.push(`info ${r.status}: ${JSON.stringify(r.json?.errors?.map(e=>e.detail)).slice(0,200)}`); else il=r.json.data;
  // version (description, keywords, promo)
  const va={description:d.description,keywords:d.keywords,promotionalText:d.promotionalText,supportUrl:SITE,marketingUrl:SITE};
  // Creating the app-info locale also creates the version locale, so look it up fresh.
  let vl=(await api('GET',`/v1/appStoreVersions/${live.versionId}/appStoreVersionLocalizations?limit=200`)).json.data.find(x=>x.attributes.locale===loc);
  if(vl) r=await api('PATCH',`/v1/appStoreVersionLocalizations/${vl.id}`,{data:{type:'appStoreVersionLocalizations',id:vl.id,attributes:va}});
  else r=await api('POST','/v1/appStoreVersionLocalizations',{data:{type:'appStoreVersionLocalizations',attributes:{locale:loc,...va},relationships:{appStoreVersion:{data:{type:'appStoreVersions',id:live.versionId}}}}});
  if(r.status>=300) msgs.push(`version ${r.status}: ${JSON.stringify(r.json?.errors?.map(e=>e.detail)).slice(0,200)}`); else vl=r.json.data;
  // read back
  let ok=true;
  if(il?.id){const g=(await api('GET',`/v1/appInfoLocalizations/${il.id}`)).json.data.attributes; if(g.name!==d.name||g.subtitle!==d.subtitle){ok=false;msgs.push('info readback mismatch');}}else ok=false;
  if(vl?.id){const g=(await api('GET',`/v1/appStoreVersionLocalizations/${vl.id}`)).json.data.attributes; for(const k of ['description','keywords','promotionalText']) if(g[k]!==d[k]){ok=false;msgs.push(`${k} readback mismatch`);}}else ok=false;
  console.log(loc.padEnd(8), ok?'VERIFIED':'FAILED', msgs.join(' | '));
}
