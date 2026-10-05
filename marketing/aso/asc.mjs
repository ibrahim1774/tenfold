import { createSign, createPrivateKey } from 'node:crypto';import { readFileSync } from 'node:fs';import { homedir } from 'node:os';
const KEY_ID='5YX524BBAM', ISSUER='8e2cad29-fcba-4f15-baf7-23b9cbcd6c24', API='https://api.appstoreconnect.apple.com';
const pk=createPrivateKey(readFileSync(`${homedir()}/.private_keys/AuthKey_${KEY_ID}.p8`,'utf8'));
const tok=()=>{const n=Math.floor(Date.now()/1000);const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const h=`${b({alg:'ES256',kid:KEY_ID,typ:'JWT'})}.${b({iss:ISSUER,iat:n,exp:n+900,aud:'appstoreconnect-v1'})}`;const s=createSign('SHA256');s.update(h);return `${h}.${s.sign({key:pk,dsaEncoding:'ieee-p1363'}).toString('base64url')}`};
export async function api(m,p,body){for(let i=0;i<5;i++){const r=await fetch(p.startsWith('http')?p:API+p,{method:m,headers:{Authorization:`Bearer ${tok()}`,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});if(r.status===429||r.status>=500){await new Promise(z=>setTimeout(z,2000*(i+1)));continue;}const t=await r.text();return {status:r.status,json:t?JSON.parse(t):null};}throw new Error('retries');}
export const APP='6816729918';
