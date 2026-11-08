import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const script=fs.readFileSync('scripts/points-staging-access.mjs','utf8');
const wf=fs.readFileSync('.github/workflows/verify-points-staging-browser.yml','utf8');

test('ephemeral Access token is development-only and run-scoped', ()=>{
  assert.match(script,/DEVELOPMENT_ACCOUNT='46aad4738793fbaca88574832a2ccc0f'/);
  assert.match(script,/decision:'non_identity'/);
  assert.match(script,/duration:'24h'/);
  assert.match(script,/::add-mask::/);
  assert.doesNotMatch(script,/6986fd633f4e33bf804c921697b2d797/);
  assert.doesNotMatch(script,/\.ekodi\.kr/);
});

test('refuses a non-development account', ()=>{
  const r=spawnSync(process.execPath,['scripts/points-staging-access.mjs','open'],{env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'6986fd633f4e33bf804c921697b2d797',CLOUDFLARE_API_TOKEN:'x',POINTS_E2E_RUN:'1'},encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/development Cloudflare account required/);
});

test('workflow issues the token when secrets are absent and always removes it', ()=>{
  assert.match(wf,/node scripts\/points-staging-access\.mjs open/);
  assert.match(wf,/if: always\(\) && env\.E2E_ACCESS_EPHEMERAL == '1'\n\s+run: node scripts\/points-staging-access\.mjs close/);
  assert.doesNotMatch(wf,/for name in [^\n]*CF_ACCESS_CLIENT_ID/);
});


// Exercise the real CLI with all Cloudflare endpoints mocked. These tests
// never create/deactivate actual Access apps or expose credential values.
const mockedAccessProcess=String.raw`
const actions=[];
const own='ekodi-points-e2e-'+process.env.POINTS_E2E_RUN;
const json=result=>new Response(JSON.stringify({success:true,result}),{
  status:200,headers:{'content-type':'application/json'}
});
globalThis.fetch=async (input,init={})=>{
  const url=String(input),method=init.method||'GET';
  if(url.endsWith('/api/session'))return new Response(null,{status:200});
  if(url.includes('/access/apps?per_page=200'))
    return json([{id:'app1',name:'staging-only',domain:'ekodi-admin-staging.ekodi-development.workers.dev'}]);
  if(url.endsWith('/access/service_tokens')&&method==='POST'&&process.env.TEST_ACCESS_DENY_TOKEN_CREATE==='1')
    return new Response(JSON.stringify({success:false,errors:[{code:1010,error:'auth.forbidden'}]}),{
      status:403,headers:{'content-type':'application/json'}
    });
  if(url.endsWith('/access/apps/app1/policies')&&method==='POST'){
    actions.push({method,url,body:JSON.parse(init.body)});
    return json({id:'created-policy'});
  }
  if(url.endsWith('/access/apps/app1/policies?per_page=100'))
    return json([{id:'same-run',name:own},{id:'another-run',name:'ekodi-points-e2e-other-run'}]);
  if(url.endsWith('/access/service_tokens?per_page=100'))
    return json([{id:'same-token',name:own},{id:'other-token',name:'ekodi-points-e2e-other-run'}]);
  if(method==='DELETE'&&url.includes('/access/')){
    actions.push({method,url});
    return json(null);
  }
  throw new Error('UNEXPECTED_MOCK_API:'+method+':'+url);
};
process.argv=[process.execPath,'scripts/points-staging-access.mjs',process.env.TEST_ACCESS_MODE];
await import('./scripts/points-staging-access.mjs');
console.log('ACCESS_PROBE='+JSON.stringify(actions));
`;
function runMockAccess(mode,extra={}) {
  return spawnSync(process.execPath,['--input-type=module','-e',mockedAccessProcess],{
    env:{...process.env,
      CLOUDFLARE_ACCOUNT_ID:'46aad4738793fbaca88574832a2ccc0f',
      CLOUDFLARE_API_TOKEN:'unit-test-cloudflare-development',
      POINTS_E2E_RUN:'run-123456',
      TEST_ACCESS_MODE:mode,
      ...extra,
    },encoding:'utf8',timeout:10000,
  });
}
function actionsOf(result){
  const raw=result.stdout.split(/\r?\n/).find(line=>line.startsWith('ACCESS_PROBE='));
  assert.ok(raw,result.stdout+'\n'+result.stderr);
  return JSON.parse(raw.slice('ACCESS_PROBE='.length));
}

test('static E2E grants only the exact protected service-token ID, never every account token',()=>{
  const run=runMockAccess('open-static',{STATIC_ACCESS_SERVICE_TOKEN_ID:'approved-token-123456'});
  assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
  const calls=actionsOf(run);
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.name,'ekodi-points-e2e-run-123456');
  assert.deepEqual(calls[0].body.include,[{service_token:{token_id:'approved-token-123456'}}]);
  assert.equal(calls[0].body.decision,'non_identity');
  assert.doesNotMatch(JSON.stringify(calls),/any_valid_service_token/);
});
test('missing protected static token ID rejects before any Access mutation',()=>{
  const run=runMockAccess('open-static',{STATIC_ACCESS_SERVICE_TOKEN_ID:''});
  assert.notEqual(run.status,0);
  assert.match(run.stdout+run.stderr,/STATIC_ACCESS_SERVICE_TOKEN_ID is required/);
  assert.doesNotMatch(run.stdout,/ACCESS_PROBE=/);
});
test('cleanup cannot delete any other E2E run policy or service token',()=>{
  const run=runMockAccess('close',{STATIC_ACCESS_SERVICE_TOKEN_ID:''});
  assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
  const calls=actionsOf(run);
  assert.deepEqual(calls.filter(x=>x.method==='DELETE').map(x=>x.url.split('/').slice(-2).join('/')),
    ['policies/same-run','service_tokens/same-token']);
  assert.doesNotMatch(JSON.stringify(calls),/another-run|other-token/);
});
test('workflow cannot use a static Access credential without its exact token ID',()=>{
  assert.match(wf,/STATIC_ACCESS_SERVICE_TOKEN_ID: \$\{\{ secrets\.CF_ACCESS_STAGING_SERVICE_TOKEN_ID \}\}/);
  assert.match(wf,/&& \[ -n "\$\{STATIC_ACCESS_SERVICE_TOKEN_ID:-\}" \]/);
  assert.doesNotMatch(script,/any_valid_service_token:\s*\{\}/);
  assert.match(script,/String\(p\.name\|\|''\)===name/);
  assert.match(script,/String\(t\.name\|\|''\)===name/);
});

test('403 while minting a development token stops before Access policy mutation',()=>{
  const result=runMockAccess('open',{TEST_ACCESS_DENY_TOKEN_CREATE:'1'});
  assert.notEqual(result.status,0);
  assert.match(result.stdout+result.stderr,/POINTS_E2E_SERVICE_TOKEN_CREATION_DENIED/);
  assert.match(result.stdout+result.stderr,/403/);
  assert.doesNotMatch(result.stdout,/ACCESS_PROBE=/);
});
test('workflow rejects a partial static Access identity instead of implicit fallback',()=>{
  assert.match(wf,/configured_static_fields=0/);
  assert.match(wf,/for name in STATIC_ACCESS_ID STATIC_ACCESS_SECRET STATIC_ACCESS_SERVICE_TOKEN_ID; do/);
  assert.match(wf,/configured_static_fields.*-ne 0.*-ne 3/);
  assert.match(wf,/Incomplete Points staging Access identity/);
  assert.match(wf,/exit 2\n\s+fi\n\s+# Never authorize any valid token/);
});
