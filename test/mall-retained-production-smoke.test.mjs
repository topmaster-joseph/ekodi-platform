import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMallRetainedProductionSmoke, verifyMallRetainedProductionSmokeWithRetry } from '../scripts/verify-mall-retained-production-smoke.mjs';

const fixtures=()=>new Map([
 ['https://ekodi.kr/ekodimall/','<html>EKODI MALL ... ALL MARKET ... LOCAL COMMONS ... SELLER STUDIO</html>'],
 ['https://ekodi.kr/ekodimall/admin/channel-settings','<html><script src="/workspace-admin.js?v=test"></script></html>'],
 ['https://ekodi.kr/workspace-admin.js?v=test','channel-workbench channelAccountForm data-account-auth'],
 ['https://ekodi.kr/marketing-publish-api/health',JSON.stringify({
   ok:true,service:'ekodi-marketing-publishing',scheduler:true,channelAutomationCore:true
 })]
]);
function requestFor(map,seen=[]){
  return async(url,options)=>{
    seen.push({url,method:options.method});
    if(!map.has(url))return new Response('Not Found',{status:404});
    return new Response(map.get(url),{status:200});
  };
}
test('retains Mall public, channel admin asset and publishing checks in central release',async()=>{
 const seen=[];
 const report=await verifyMallRetainedProductionSmoke({request:requestFor(fixtures(),seen)});
 assert.equal(report.ok,true);
 assert.equal(report.productionMutationPerformed,false);
 assert.deepEqual(report.routesChecked,[
  '/ekodimall/','/ekodimall/admin/channel-settings','/workspace-admin.js','/marketing-publish-api/health'
 ]);
 assert.equal(seen.length,4);
 assert.ok(seen.every(x=>x.method==='GET'&&x.url.startsWith('https://ekodi.kr/')));
});
test('missing public UI marker blocks false-positive completion',async()=>{
 const fixture=fixtures();fixture.set('https://ekodi.kr/ekodimall/','EKODI MALL');
 await assert.rejects(verifyMallRetainedProductionSmoke({request:requestFor(fixture)}),/Mall public marker missing/);
});
test('missing privileged admin JS must fail',async()=>{
 const fixture=fixtures();fixture.set('https://ekodi.kr/workspace-admin.js?v=test','channel-workbench');
 await assert.rejects(verifyMallRetainedProductionSmoke({request:requestFor(fixture)}),/Mall channel admin marker missing/);
});
test('asset origins outside canonical EKODI are rejected before any fetch',async()=>{
 const fixture=fixtures();
 fixture.set('https://ekodi.kr/ekodimall/admin/channel-settings','<script src="https://invalid.example/workspace-admin.js"></script>');
 const seen=[];
 await assert.rejects(verifyMallRetainedProductionSmoke({request:requestFor(fixture,seen)}),/asset origin\/path mismatch/);
 assert.ok(!seen.some(x=>x.url.startsWith('https://invalid.example')));
});
test('publishing adapter status must be live and structurally healthy',async()=>{
 const fixture=fixtures();fixture.set('https://ekodi.kr/marketing-publish-api/health',JSON.stringify({
  ok:true,service:'ekodi-marketing-publishing',scheduler:true,channelAutomationCore:false
 }));
 await assert.rejects(verifyMallRetainedProductionSmoke({request:requestFor(fixture)}),/not ready/);
});
test('transient failed read retries within a bounded count; no mutation',async()=>{
 const fixture=fixtures();let first=true;const seen=[];
 const read=async(url,options)=>{
   if(first && url==='https://ekodi.kr/ekodimall/'){first=false;return new Response('Unavailable',{status:503});}
   return requestFor(fixture,seen)(url,options);
 };
 const report=await verifyMallRetainedProductionSmokeWithRetry({request:read,attempts:2,delayMs:0});
 assert.equal(report.ok,true);
 assert.equal(first,false);
});
