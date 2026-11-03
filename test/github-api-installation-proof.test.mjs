import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,webcrypto} from 'node:crypto';
import {attestGitHubInstallationToken,isVerifiedGitHubInstallationProof}
  from '../github-api-installation-proof.js';

const NOW=Date.parse('2026-10-30T12:00:00Z');
const ID=54321,APP=76,REPO='topmaster-joseph/ekodi-platform';
const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey
  .export({type:'pkcs8',format:'pem'});
const settings=(DB={},overrides={})=>({
  EKODI_GITHUB_BUDGET_ADMISSION_ENABLED:'true',
  EKODI_GITHUB_READONLY_PROBE_ENABLED:'true',
  EKODI_GITHUB_APP_ID:String(APP),
  EKODI_GITHUB_INSTALLATION_ID:String(ID),
  EKODI_GITHUB_APP_PRIVATE_KEY:key,
  DB,...overrides
});
const DB=(writes=[])=>({prepare(sql){return{bind(...values){return{
  run:async()=>{writes.push({sql,values});return{meta:{changes:1}}}
}}}}});
const h={'x-ratelimit-resource':'core','x-ratelimit-limit':'5000',
  'x-ratelimit-remaining':'4722',
  'x-ratelimit-reset':String(Math.floor((NOW+3600000)/1000))};
const response=(status,data,headers={})=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json',...headers}
});
const grant=(overrides={})=>({
  token:'test-app-installation-token-not-for-logging',
  expires_at:new Date(NOW+3600000).toISOString(),
  repository_selection:'selected',repositories:[{full_name:REPO}],
  permissions:{metadata:'read'},...overrides
});
function network({badRepo=false,badScope=false,noRate=false,deny=false,calls=[]}={}){
  return async(url,init)=>{
    calls.push({url,method:init.method,body:init.body,redirect:init.redirect});
    if(deny)return response(403,{message:'Permission denied'});
    if(calls.length===1)return response(201,grant(badScope?{
      permissions:{metadata:'read',contents:'write'}}:{}));
    if(calls.length===2)return response(200,{
      full_name:badRepo?'foreign/repository':REPO},noRate?{}:h);
    throw Error('Unexpected third API request');
  };
}
const attest=(env,fetchImpl)=>attestGitHubInstallationToken(env,{
  fetchImpl,subtle:webcrypto.subtle,nowMs:NOW
});

test('two feature gates stay closed without GitHub or D1 calls',async()=>{
  let calls=0;const e=settings({prepare(){calls++;throw Error('no DB');}});
  delete e.EKODI_GITHUB_BUDGET_ADMISSION_ENABLED;
  const transport=async()=>{calls++;throw Error('no network');};
  assert.equal((await attest(e,transport)).reason,'not_connected');
  e.EKODI_GITHUB_BUDGET_ADMISSION_ENABLED='true';
  delete e.EKODI_GITHUB_READONLY_PROBE_ENABLED;
  assert.equal((await attest(e,transport)).reason,'readonly_probe_not_enabled');
  assert.equal(calls,0);
});
test('reuse existing RS256 signer, metadata-only token, verified quota and private 25s proof',async()=>{
  const writes=[],calls=[];const a=await attest(settings(DB(writes)),network({calls}));
  assert.equal(a.verified,true);
  assert.deepEqual(calls.map(x=>x.url),[
    'https://api.github.com/app/installations/'+ID+'/access_tokens',
    'https://api.github.com/repos/'+REPO
  ]);
  assert.deepEqual(calls.map(x=>x.method),['POST','GET']);
  assert.deepEqual(JSON.parse(calls[0].body),{
    repositories:['ekodi-platform'],permissions:{metadata:'read'}
  });
  assert.equal(writes.length,1);
  assert.deepEqual(writes[0].values.slice(0,4),[ID,'core',5000,4722]);
  assert.equal(isVerifiedGitHubInstallationProof(a.context,{
    installationId:ID,appId:APP,nowMs:NOW+24999}),true);
  assert.equal(isVerifiedGitHubInstallationProof(a.context,{
    installationId:ID,appId:APP,nowMs:NOW+25000}),false);
  assert.equal(isVerifiedGitHubInstallationProof({...a.context},{
    installationId:ID,appId:APP,nowMs:NOW}),false);
  assert.equal(isVerifiedGitHubInstallationProof({
    source:'ekodi-orchestrator',verifiedInstallationToken:true,
    installationId:ID,appId:APP},{installationId:ID,appId:APP,nowMs:NOW}),false);
  assert.ok(!JSON.stringify(a).includes('test-app-installation-token'));
});
test('unverified repository, broad App token, missing headers or permission denied fail closed',async()=>{
  for(const variant of [{badRepo:true},{badScope:true},{noRate:true},{deny:true}]){
    const writes=[],calls=[];
    const a=await attest(settings(DB(writes)),network({...variant,calls}));
    assert.equal(a.verified,false,JSON.stringify(variant));
    assert.equal(a.context,null);
    assert.equal(writes.length,0);
    assert.ok(calls.length<=2);
  }
});
test('missing key, wrong App configuration and D1 outage do not mint proof',async()=>{
  const e=settings(DB(),{EKODI_GITHUB_APP_PRIVATE_KEY:''});
  assert.equal((await attest(e,async()=>{throw Error('should not fetch')})).verified,false);
  const e2=settings(DB(),{EKODI_GITHUB_APP_ID:'0'});
  assert.equal((await attest(e2,async()=>{throw Error('should not fetch')})).verified,false);
  const result=await attest(settings({prepare(){throw Error('db outage');}}),network());
  assert.equal(result.verified,false);
});
