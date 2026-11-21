import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PUBLIC_URLS,verify,check} from '../scripts/verify-points-public-lockdown.mjs';
const config='window.EKODI_MY_CONFIG={"pointsEnabled":false,"dataMode":"production"};';
const app=[
 'function isCurrentHistoryOwner(snapshot,session)',
 'session?.user?.id===snapshot.ownerId',
 'snapshot.site!==select.value',
 'snapshot.revision!==viewRevision',
 'await sb.auth.getSession()'].join('\n');
test('the live public contract is safe only when disabled and owner-scoped',()=>{
 const x=verify({config,app});assert.equal(x.points_enabled,false);
 assert.equal(x.checked_guards,5);assert.equal(x.signed_in_e2e_verified,false);
 assert.equal(x.backup_verified,false);
});
test('fail closed on activation, wrong environment, malformed JSON, empty source',()=>{
 for(const c of [config.replace('false','true'),config.replace('production','development'),
  'window.EKODI_MY_CONFIG={pointsEnabled:false};','',config+'\nalert(1);']){
  assert.throws(()=>verify({config:c,app}),/points_live_/);
 }
});
test('every owner, session, site, revision CSV guard is independently required',()=>{
 for(const s of app.split('\n'))assert.throws(()=>verify({config,app:app.replace(s,'')}),/points_live_member_owner_csv_guard_missing/);
});
test('external URLs use anonymous GET only; reject redirects, Access login and cross-host',async()=>{
 const calls=[];
 const ok=async(url,opts)=>{calls.push({url,opts});return {
  status:200,url,redirected:false,text:async()=>url===PUBLIC_URLS.config?config:app};};
 assert.equal((await check({fetchImpl:ok})).outcome,'public_points_lockdown_verified');
 assert.deepEqual(calls.map(x=>x.url),Object.values(PUBLIC_URLS));
 for(const c of calls){assert.equal(c.opts.method,'GET');assert.equal(c.opts.redirect,'error');
  assert.equal(c.opts.credentials,'omit');assert.equal(c.opts.headers.authorization,undefined);}
 for(const defect of [{status:302},{status:403},{redirected:true},{url:'https://elsewhere.example/'}])
  await assert.rejects(check({fetchImpl:async()=>({status:200,url:PUBLIC_URLS.config,redirected:false,
  text:async()=>config,...defect})}),/points_live_config_http_boundary_failed/);
});
test('scheduled workflow cannot read protected credentials or write production',()=>{
 const w=readFileSync(new URL('../.github/workflows/verify-points-public-lockdown.yml',import.meta.url),'utf8');
 assert.match(w,/on:\n  workflow_dispatch:/);
 assert.match(w,/schedule:/);
 assert.match(w,/permissions:\n  contents: read/);
 assert.match(w,/node --test test\/points-public-lockdown\.test\.mjs/);
 assert.match(w,/node scripts\/verify-points-public-lockdown\.mjs/);
 assert.doesNotMatch(w,/secrets\.|environment: production|supabase db|database\/query|wrangler deploy|POINTS_ENABLED=true/);
});
