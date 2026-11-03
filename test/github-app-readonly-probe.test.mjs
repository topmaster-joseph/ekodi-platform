import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createVerify,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {probeEkodiGitHubInstallation} from '../github-app-readonly-probe.js';

const NOW=Date.parse('2026-10-30T10:00:00Z');
const REPO='topmaster-joseph/ekodi-platform';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pkcs8=privateKey.export({type:'pkcs8',format:'pem'});
const headers={'x-ratelimit-resource':'core','x-ratelimit-limit':'5000',
  'x-ratelimit-remaining':'4997',
  'x-ratelimit-reset':String(Math.floor((NOW+3600000)/1000))};
const http=(status,body,extra={})=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json',...extra}
});
const grant=overrides=>({
  token:'test-installation-token-never-expose',expires_at:new Date(NOW+3600000).toISOString(),
  repository_selection:'selected',repositories:[{full_name:REPO}],
  permissions:{metadata:'read'},...overrides
});
const env=(DB,change={})=>({
  EKODI_GITHUB_READONLY_PROBE_ENABLED:'true',
  EKODI_GITHUB_APP_ID:'876543',
  EKODI_GITHUB_INSTALLATION_ID:'54321',
  EKODI_GITHUB_APP_PRIVATE_KEY:pkcs8,
  DB,...change
});
function fakeDB(){
  const calls=[];return {calls,prepare(sql){return{bind(...values){return{
    async run(){calls.push({sql,values});return{meta:{changes:1}}}
  }}}}};
}
function mockedFetch({token=grant(),repoStatus=200,repoBody={full_name:REPO},
  repoHeaders=headers,tokenStatus=201}={}){
  const calls=[];
  return {
    calls,
    fetchImpl:async (url,init)=>{
      calls.push({url,init});
      if(calls.length===1)return http(tokenStatus,token);
      if(calls.length===2)return http(repoStatus,repoBody,repoHeaders);
      throw Error('unexpected network call');
    }
  };
}
const run=(e,m)=>probeEkodiGitHubInstallation(e,{
  fetchImpl:m.fetchImpl,subtle:webcrypto.subtle,now:()=>NOW
});

test('the entire transport is disabled without explicit owner flag',async()=>{
  let called=0;
  const result=await probeEkodiGitHubInstallation({
    EKODI_GITHUB_APP_PRIVATE_KEY:pkcs8,
  },{fetchImpl:async()=>{called++;throw Error('network forbidden')}});
  assert.deepEqual(result,{ok:false,reason:'not_enabled',githubApiCalls:0,tokenExposed:false});
  assert.equal(called,0);
});
test('no key, wrong canonical repository and absent D1 all deny before network',async()=>{
  const db=fakeDB();const m=mockedFetch();
  for(const changed of [
    {EKODI_GITHUB_APP_PRIVATE_KEY:''},
    {EKODI_GITHUB_REPOSITORY:'other-company/other-repo'},
    {DB:null},
    {EKODI_GITHUB_INSTALLATION_ID:'0'},
  ])assert.equal((await run(env(db,changed),m)).ok,false);
  assert.equal(m.calls.length,0);
  assert.equal(db.calls.length,0);
});
test('authentic RS256 app JWT mints metadata-only one-repository token and records measured D1 headers',async()=>{
  const db=fakeDB(),m=mockedFetch();
  const result=await run(env(db),m);
  assert.deepEqual(result,{
    ok:true,reason:'verified_readonly_observation',githubApiCalls:2,
    resource:'core',tokenExposed:false,installationVerified:true,
    admissionEnabled:false,releaseAuthorized:false
  });
  assert.equal(m.calls.length,2);
  assert.equal(m.calls[0].url,
    'https://api.github.com/app/installations/54321/access_tokens');
  assert.equal(m.calls[0].init.method,'POST');
  assert.equal(m.calls[0].init.redirect,'manual');
  assert.deepEqual(JSON.parse(m.calls[0].init.body),{
    repositories:['ekodi-platform'],permissions:{metadata:'read'}
  });
  const jwt=m.calls[0].init.headers.authorization.slice('Bearer '.length);
  const [header,payload,signature]=jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header,'base64url').toString()),{
    alg:'RS256',typ:'JWT'
  });
  const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
  assert.equal(claims.iss,'876543');
  assert.equal(claims.exp-claims.iat,540);
  const verifier=createVerify('RSA-SHA256');
  verifier.update(header+'.'+payload);verifier.end();
  assert.equal(verifier.verify(publicKey,Buffer.from(signature,'base64url')),true);
  assert.equal(m.calls[1].init.method,'GET');
  assert.equal(m.calls[1].url,'https://api.github.com/repos/'+REPO);
  assert.equal(m.calls[1].init.headers.authorization,
    'Bearer test-installation-token-never-expose');
  assert.equal(db.calls.length,1);
  assert.equal(db.calls[0].values[0],54321);
  assert.equal(db.calls[0].values[1],'core');
  assert.equal(db.calls[0].values[3],4997);
  assert.doesNotMatch(JSON.stringify(result),/test-installation-token|PRIVATE KEY|Bearer/);
});
test('unverified scope or repository refuses to use installation token',async()=>{
  for(const override of [
    {repository_selection:'all'},
    {repositories:[{full_name:'wrong/repo'}]},
    {permissions:{metadata:'read',contents:'write'}},
    {permissions:{metadata:'write'}},
    {expires_at:new Date(NOW-1000).toISOString()},
    {token:null},
  ]){
    const db=fakeDB(),m=mockedFetch({token:grant(override)});
    const result=await run(env(db),m);
    assert.equal(result.reason,'token_scope_unverified');
    assert.equal(m.calls.length,1);
    assert.equal(db.calls.length,0);
  }
});
test('permission failures, redirects, wrong repo and missing rate headers never write quota observations',async()=>{
  for(const options of [
    {tokenStatus:403},
    {repoStatus:403},
    {repoStatus:302},
    {repoBody:{full_name:'attacker/repo'}},
    {repoHeaders:{}},
    {repoHeaders:{...headers,'x-ratelimit-resource':'search'}}
  ]){
    const db=fakeDB(),m=mockedFetch(options);
    const res=await run(env(db),m);
    assert.equal(res.ok,false);
    assert.equal(res.tokenExposed,false);
    assert.equal(db.calls.length,0);
    assert.ok(m.calls.length<=2);
  }
});
test('PKCS1 or malformed signing keys are rejected without external API requests',async()=>{
  const pkcs1=privateKey.export({type:'pkcs1',format:'pem'});
  const m=mockedFetch(),db=fakeDB();
  const res=await run(env(db,{EKODI_GITHUB_APP_PRIVATE_KEY:pkcs1}),m);
  assert.equal(res.ok,false);
  assert.equal(res.reason,'probe_unavailable');
  assert.equal(res.githubApiCalls,0);
  assert.equal(m.calls.length,0);
});
test('the probe exposes no HTTP handler, writes or release authority',()=>{
  const source=readFileSync(new URL('../github-app-readonly-probe.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/export\s+default|\.put\(|\.delete\(|\/statuses\/|merge_method|workflow_dispatch/);
  assert.match(source,/EKODI_GITHUB_READONLY_PROBE_ENABLED/);
  assert.match(source,/permissions:\{metadata:'read'\}/);
});
