#!/usr/bin/env node
// EKODI-HSTS-PRELOAD-PREP-001 — read-only readiness report for HSTS preload (no submission,
// no configuration change). Run where the internet is reachable (GitHub runner):
//   node scripts/check-hsts-preload-readiness.mjs [domain]
// The only expected blocker while HSTS_PRELOAD_ENABLED=false is the missing `preload` token.
import { lookup } from 'node:dns/promises';
import { appendFileSync } from 'node:fs';

const domain=String(process.argv[2]||'ekodi.kr').toLowerCase();
const EXPECTED_WHILE_PREPARING=new Set(['header.preloadable.preload.missing']);
const lines=[`### HSTS preload readiness — ${domain} (${new Date().toISOString()})`];
const log=line=>{lines.push(line);console.log(line);};

async function json(url){
  try{const r=await fetch(url,{headers:{accept:'application/json'}});return {ok:r.ok,status:r.status,body:await r.json().catch(()=>null)};}
  catch(error){return {ok:false,status:0,error:String(error?.message||error)};}
}
async function head(url){
  try{const r=await fetch(url,{redirect:'manual'});return {status:r.status,location:r.headers.get('location')||'',hsts:r.headers.get('strict-transport-security')||''};}
  catch(error){return {status:0,error:String(error?.message||error)};}
}

const preloadable=await json(`https://hstspreload.org/api/v2/preloadable?domain=${domain}`);
const status=await json(`https://hstspreload.org/api/v2/status?domain=${domain}`);
const issues=[...(preloadable.body?.errors||[]).map(e=>({...e,level:'error'})),...(preloadable.body?.warnings||[]).map(e=>({...e,level:'warning'}))];
log(`- hstspreload.org status: ${status.body?.status||'unknown'} (HTTP ${status.status})`);
if(!preloadable.ok)log(`- preloadable check unavailable (HTTP ${preloadable.status} ${preloadable.error||''})`);
for(const issue of issues)log(`- ${issue.level}${EXPECTED_WHILE_PREPARING.has(issue.code)?' (expected while preparing)':''}: ${issue.code} — ${issue.summary||''}`);

const https=await head(`https://${domain}/`);
log(`- https://${domain}/ → ${https.status}, HSTS: ${https.hsts||'(none)'}`);
const http=await head(`http://${domain}/`);
log(`- http://${domain}/ → ${http.status} ${http.location?'→ '+http.location:''}`);
const httpOk=[301,302,307,308].includes(http.status)&&http.location.startsWith(`https://${domain}`);
log(`  - redirects to https on the same host: ${httpOk?'yes':'NO'}`);
try{
  await lookup(`www.${domain}`);
  const www=await head(`https://www.${domain}/`);
  log(`- www.${domain} resolves; https → ${www.status} ${www.location?'→ '+www.location:''}`);
}catch{log(`- www.${domain}: no DNS record (fine for preload)`);}

const blockers=issues.filter(i=>i.level==='error'&&!EXPECTED_WHILE_PREPARING.has(i.code));
log(blockers.length||!httpOk?`- RESULT: not ready (${blockers.length} blocking error(s)${httpOk?'':', http→https redirect'})`:'- RESULT: ready — only the `preload` token is missing; flip HSTS_PRELOAD_ENABLED after owner approval.');
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
