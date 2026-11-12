import test from 'node:test';
import assert from 'node:assert/strict';
import sites from '../config/site-lifecycle-registry.json' with {type:'json'};
import capabilities from '../config/capability-registry.json' with {type:'json'};
import {projectSiteAiFleet} from '../ekodi-site-ai-fleet-readonly.js';
import {previewSiteAiMicroIntent} from '../ekodi-site-ai-intent-preview.js';
import {ORIGIN,verifyLiveSiteAiFleet,verifyLiveSiteAiPreview,verifyProductionSiteAi} from '../scripts/verify-ekodi-site-ai-live.mjs';

const first=sites.existingWorkspaceSites.find(s=>s.class==='workspace_user_site'
  &&/^https:\/\/ekodi\.kr\/[a-z0-9-]+\/?$/.test(s.canonicalUrl)
  &&!/planned|preparing|pending/i.test(s.migrationState));
const makeFleet=()=>({ok:true,...projectSiteAiFleet(sites,[],{ledgerAvailable:true})});
const makePreview=()=>({ok:true,previewOnly:true,executionAuthorized:false,
 plan:previewSiteAiMicroIntent({siteId:first.id,scope:'site_specific',action:'observe',
   capabilityId:'core.automation'}, {sites,capabilities})});
const json=(status,data)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const token='f'.repeat(64);
function fakeFetch({leakGuest=false,crossOriginAllowed=false,corruptFleet=false,corruptPreview=false}={}){
 const calls=[];
 const fetchImpl=async(uri,opt)=>{
  const u=new URL(uri);
  assert.equal(u.origin,ORIGIN);
  assert.equal(opt.redirect,'error');
  const auth=opt.headers.authorization===`Bearer ${token}`;
  calls.push({path:u.pathname,method:opt.method,auth,body:opt.body,origin:opt.headers.origin});
  if(!auth)return json(leakGuest?200:401,leakGuest?makeFleet():{ok:false});
  if(u.pathname.endsWith('/fleet'))return json(200,corruptFleet?{...makeFleet(),verifiedLiveAgentsAvailable:true}:makeFleet());
  if(u.pathname.endsWith('/intent-preview')){
   if(opt.headers.origin==='https://invalid.example')return json(crossOriginAllowed?200:403,{ok:crossOriginAllowed});
   if(JSON.parse(opt.body).capabilityId==='unregistered.canary')return json(400,{ok:false});
   return json(200,corruptPreview?{...makePreview(),executionAuthorized:true}:makePreview());
  }
  throw new Error('unexpected_url');
 };
 return {calls,fetchImpl};
}
test('valid fleet is explicitly unverified and matched to canonical registry',()=>{
 const report=verifyLiveSiteAiFleet(makeFleet());
 assert.ok(report.siteCount>0);
});
test('valid preview requires no implicit powers, money or assigned AI',()=>{
 assert.equal(verifyLiveSiteAiPreview(makePreview()).siteId,first.id);
});
test('live canary uses bounded read-only API probes with temporary auth',async()=>{
 const fake=fakeFetch();
 const result=await verifyProductionSiteAi({token,fetchImpl:fake.fetchImpl});
 assert.equal(result.ok,true);
 assert.equal(result.productionMutationPerformed,false);
 assert.equal(result.paidProviderCalls,0);
 assert.equal(fake.calls.length,6);
 assert.deepEqual(fake.calls.map(x=>x.path.endsWith('/fleet')?'fleet':'preview'),
   ['fleet','preview','fleet','preview','preview','preview']);
 assert.ok(fake.calls.filter(x=>x.method==='POST').every(x=>x.body&&x.path.endsWith('/intent-preview')));
});
test('guest data leak fails closed',async()=>{
 const fake=fakeFetch({leakGuest:true});
 await assert.rejects(()=>verifyProductionSiteAi({token,fetchImpl:fake.fetchImpl}),/site_ai_fleet_guest_leak/);
});
test('cross-origin mutation preview cannot succeed',async()=>{
 const fake=fakeFetch({crossOriginAllowed:true});
 await assert.rejects(()=>verifyProductionSiteAi({token,fetchImpl:fake.fetchImpl}),/site_ai_preview_cross_origin_allowed/);
});
test('fake live-agent count is rejected',async()=>{
 const fake=fakeFetch({corruptFleet:true});
 await assert.rejects(()=>verifyProductionSiteAi({token,fetchImpl:fake.fetchImpl}),/site_ai_fleet_contract_invalid/);
});
test('preview must not claim ability to execute',async()=>{
 const fake=fakeFetch({corruptPreview:true});
 await assert.rejects(()=>verifyProductionSiteAi({token,fetchImpl:fake.fetchImpl}),/site_ai_preview_false_authority/);
});
test('session is mandatory and never accepted from plaintext',async()=>{
 await assert.rejects(()=>verifyProductionSiteAi({token:'anything'}),/site_ai_session_missing/);
});
