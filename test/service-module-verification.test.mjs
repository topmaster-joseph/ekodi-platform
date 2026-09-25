import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  runServiceModuleFunctionalVerification,
  serviceModuleFunctionalVerificationContract,
} from '../service-module-verification.js';

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
}

function successfulFetch(calls,{failProbe='' }={}){
  return async (input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    const headers=new Headers(options.headers||{});
    const row={
      path:url.pathname+url.search,
      method:String(options.method||'GET').toUpperCase(),
      authorization:headers.get('authorization')||'',
      origin:headers.get('origin')||'',
      body:options.body===undefined?'':String(options.body),
    };
    calls.push(row);
    const idByPath={
      '/api/realtime/health':'realtime-health',
      '/api/realtime/live?tenant=ekodichurch':'realtime-live',
      '/api/membership/catalog?site=learn':'membership-catalog',
      '/api/books/public/stores':'content-stores',
      '/ekodimission/api/activities/260926-chuseok-open-table/applications':'application-validation',
      '/api/control/confirmations/workspaces':'confirmation-workspaces',
      '/publishing/health':'publishing-health',
      '/insurance/health':'insurance-health',
      '/marketing-api/health':'marketing-domain-health',
      '/marketing-publish-api/health':'marketing-publishing-health',
    };
    if(idByPath[row.path]===failProbe)return json({ok:false,error:'forced_failure'},503);
    if(row.path==='/api/realtime/health')return json({ok:true,service:'ekodi-realtime',adaptiveMedia:true,multitenant:true});
    if(row.path==='/api/realtime/live?tenant=ekodichurch')return json({ok:true,tenant:'ekodichurch',canonicalTenant:'ekodi-church',live:false,room:null});
    if(row.path==='/api/membership/catalog?site=learn')return json({site:'learn',inheritedDefault:true,plans:[{id:'free'}],billingReady:false});
    if(row.path==='/api/books/public/stores')return json({stores:[]});
    if(row.path==='/ekodimission/api/activities/260926-chuseok-open-table/applications')return json({ok:false,error:'invalid_name'},400);
    if(row.path==='/api/control/confirmations/workspaces')return json({workspaces:[]});
    if(row.path==='/publishing/health')return json({ok:true,service:'ekodi-publishing',professionalService:true,modules:['consultation','production','distribution','studio','upaper']});
    if(row.path==='/insurance/health')return json({ok:true,service:'ekodi-insurance',canonical:'https://ekodi.kr/insurance'});
    if(row.path==='/marketing-api/health')return json({ok:true,service:'ekodi-marketing-domain-api',authHandoff:'httpOnly-cookie'});
    if(row.path==='/marketing-publish-api/health')return json({ok:true,service:'ekodi-marketing-publishing',schemaReady:true,channelAutomationCore:true,scheduler:true});
    return json({error:'unexpected_probe'},404);
  };
}

test('module verification maps nine common/professional modules to non-mutating functional evidence',async()=>{
  const calls=[];
  const request=new Request('https://ekodi.kr/api/control/module-verification',{headers:{authorization:'Bearer admin-test-token'}});
  const result=await runServiceModuleFunctionalVerification(request,{fetchImpl:successfulFetch(calls)});
  assert.equal(result.schemaVersion,1);
  assert.equal(result.policy,'read-only-functional-evidence');
  assert.equal(result.productionWrites,false);
  assert.deepEqual(result.summary,{total:9,verified:4,partial:5,failed:0});
  assert.deepEqual(result.modules.map(module=>module.id),[
    'participant','member','content','application-reservation','payment-receipt-confirmation',
    'live','publishing','insurance-engine','auto-sales',
  ]);
  assert.ok(result.modules.every(module=>module.productionWrites===false));
  assert.equal(result.modules.some(module=>module.category==='core'),false);
  assert.equal(result.modules.find(module=>module.id==='content')?.evidence,'verified');
  assert.equal(result.modules.find(module=>module.id==='member')?.evidence,'partial');
});

test('functional verification never performs production data writes and forwards admin auth only to the confirmation read model',async()=>{
  const calls=[];
  const request=new Request('https://ekodi.kr/api/control/module-verification',{headers:{authorization:'Bearer admin-test-token'}});
  await runServiceModuleFunctionalVerification(request,{fetchImpl:successfulFetch(calls)});
  const mutationLike=calls.filter(call=>!['GET','HEAD'].includes(call.method));
  assert.equal(mutationLike.length,1);
  assert.equal(mutationLike[0].path,'/ekodimission/api/activities/260926-chuseok-open-table/applications');
  assert.equal(mutationLike[0].method,'POST');
  assert.equal(mutationLike[0].body,'{}');
  assert.equal(mutationLike[0].origin,'https://ekodi.kr');
  const authenticated=calls.filter(call=>call.authorization);
  assert.equal(authenticated.length,1);
  assert.equal(authenticated[0].path,'/api/control/confirmations/workspaces');
  assert.equal(authenticated[0].authorization,'Bearer admin-test-token');
});

test('a failed required probe makes only the affected module evidence fail',async()=>{
  const calls=[];
  const request=new Request('https://ekodi.kr/api/control/module-verification',{headers:{authorization:'Bearer admin-test-token'}});
  const result=await runServiceModuleFunctionalVerification(request,{fetchImpl:successfulFetch(calls,{failProbe:'insurance-health'})});
  assert.equal(result.summary.failed,1);
  assert.equal(result.modules.find(module=>module.id==='insurance-engine')?.evidence,'failed');
  assert.equal(result.modules.find(module=>module.id==='publishing')?.evidence,'partial');
  assert.equal(result.modules.find(module=>module.id==='live')?.evidence,'verified');
});

test('verification contract exposes only bounded canonical probes and marks every probe non-mutating',()=>{
  const contract=serviceModuleFunctionalVerificationContract();
  assert.equal(contract.origin,'https://ekodi.kr');
  assert.equal(contract.productionWrites,false);
  assert.equal(contract.modules.length,9);
  assert.equal(contract.probes.length,10);
  assert.ok(contract.probes.every(probe=>probe.path.startsWith('/')&&probe.nonMutating===true));
  assert.equal(contract.probes.filter(probe=>probe.forwardAdminAuthorization).length,1);
});

test('Control API exposes authenticated module-verification without leaking probe response bodies',()=>{
  const api=fs.readFileSync(new URL('../api-worker.js',import.meta.url),'utf8');
  assert.match(api,/\.\/service-module-verification\.js/);
  assert.match(api,/path === `\$\{CONTROL_PREFIX\}\/module-verification`/);
  assert.match(api,/runServiceModuleFunctionalVerification\(request, \{ fetchImpl \}\)/);
  assert.match(api,/handleAdminConfirmations\(internalRequest, env, auth\.session\)/);
  const helper=fs.readFileSync(new URL('../service-module-verification.js',import.meta.url),'utf8');
  assert.doesNotMatch(helper,/responseBody|rawBody|bodyText/);
  assert.match(helper,/productionWrites:false/);
});
