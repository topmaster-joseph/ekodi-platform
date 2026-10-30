import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runGithubAppReadonlyCanary,githubProbeConfigured,githubProbeReadModel} from '../github-app-probe-control.js';

const NOW=Date.parse('2026-10-30T12:30:00Z');
const control=()=>({
  EKODI_GITHUB_READONLY_PROBE_ENABLED:'true',EKODI_GITHUB_APP_ID:'12345',
  EKODI_GITHUB_INSTALLATION_ID:'23456',
  EKODI_GITHUB_APP_PRIVATE_KEY:'test-key-'+('x'.repeat(150))
});
async function sqliteDB(){
  const {DatabaseSync}=await import('node:sqlite');
  const native=new DatabaseSync(':memory:');
  native.exec(await readFile(
    new URL('../migrations/202610302200_github_app_probe_attempts.sql',import.meta.url),'utf8'));
  return {native,DB:{prepare(sql){return{
    bind(...v){return{
      async run(){const out=native.prepare(sql).run(...v);return{meta:{changes:Number(out.changes)}}}
    }},
    async first(){return native.prepare(sql).get()||null}
  }}}};
}
test('OFF means no secrets requested, DB write or outgoing App request',async()=>{
  let invoked=0,queries=0;
  const DB={prepare(){queries++;throw Error('unexpected DB access')}};
  const x=await runGithubAppReadonlyCanary({...control(),DB,EKODI_GITHUB_READONLY_PROBE_ENABLED:'false'},{
    nowMs:NOW,probeImpl:async()=>{invoked++;throw Error('unexpected outbound call')}
  });
  assert.deepEqual(x,{ok:false,reason:'not_enabled',githubApiCalls:0,
    releaseAuthorized:false,admissionEnabled:false,tokenExposed:false});
  assert.equal(invoked,0);assert.equal(queries,0);
});
test('invalid installation or missing secret prevents credential attempts',async()=>{
  let calls=0;
  for(const change of [
    {EKODI_GITHUB_APP_PRIVATE_KEY:''},{EKODI_GITHUB_INSTALLATION_ID:'0'},
    {EKODI_GITHUB_APP_ID:'abc'}
  ]){
    const x=await runGithubAppReadonlyCanary({...control(),...change},{
      nowMs:NOW,probeImpl:async()=>{calls++;return{ok:true}}
    });
    assert.equal(x.ok,false);
  }
  assert.equal(calls,0);
});
test('a real SQLite unique key protects the entire 6-hour slot across callers',async t=>{
  const {native,DB}=await sqliteDB();t.after(()=>native.close());
  let calls=0;
  const e={...control(),DB};
  const probeImpl=async()=>{calls++;return{
    ok:true,reason:'verified_readonly_observation',githubApiCalls:2,
    token:'should-not-escape',releaseAuthorized:true
  }};
  const list=await Promise.all(Array.from({length:12},()=>runGithubAppReadonlyCanary(e,{nowMs:NOW,probeImpl})));
  assert.equal(list.filter(x=>x.ok).length,1);
  assert.equal(calls,1);
  assert.ok(list.every(x=>x.tokenExposed===false&&x.releaseAuthorized===false&&x.admissionEnabled===false));
  assert.equal(list.filter(x=>x.reason==='already_attempted_this_window').length,11);
  const row=native.prepare('SELECT * FROM github_app_probe_attempts').get();
  assert.equal(row.state,'verified');
  assert.equal(row.github_api_calls,2);
  assert.equal(row.reason,'verified_readonly_observation');
  assert.ok(!JSON.stringify(row).includes('should-not-escape'));
  const other=await runGithubAppReadonlyCanary(e,{
    nowMs:NOW+21600000,probeImpl
  });
  assert.equal(other.ok,true);
  assert.equal(calls,2);
  assert.equal(native.prepare('SELECT COUNT(*) n FROM github_app_probe_attempts').get().n,2);
});
test('refused App token remains denied in D1 without retry storm',async t=>{
  const {native,DB}=await sqliteDB();t.after(()=>native.close());
  let calls=0;
  const probeImpl=async()=>{calls++;return {
    ok:false,reason:'token_scope_unverified',githubApiCalls:1,
    secret:'not-for-audit',tokenExposed:true
  }};
  const a=await runGithubAppReadonlyCanary({...control(),DB},{nowMs:NOW,probeImpl});
  const b=await runGithubAppReadonlyCanary({...control(),DB},{nowMs:NOW,probeImpl});
  assert.equal(a.reason,'token_scope_unverified');
  assert.equal(b.reason,'already_attempted_this_window');
  assert.equal(a.tokenExposed,false);assert.equal(calls,1);
  assert.equal(native.prepare('SELECT state FROM github_app_probe_attempts').get().state,'denied');
  assert.ok(!JSON.stringify(native.prepare('SELECT * FROM github_app_probe_attempts').get()).includes('not-for-audit'));
});
test('zero-row D1 audit update fails closed after actual provider call',async()=>{
  let writes=0,probes=0;
  const DB={prepare(sql){return {bind(){return {run:async()=>{
    if(sql.includes('INSERT OR IGNORE')){writes++;return {meta:{changes:1}};}
    if(sql.includes('UPDATE github_app_probe_attempts')){writes++;return {meta:{changes:0}};}
    throw Error('unrecognized query');
  }};}};}};
  const result=await runGithubAppReadonlyCanary({...control(),DB},{
    nowMs:NOW,probeImpl:async()=>{
      probes++;return {ok:true,reason:'verified_readonly_observation',githubApiCalls:2};
    }
  });
  assert.deepEqual(result,{ok:false,reason:'audit_unavailable',githubApiCalls:2,
    releaseAuthorized:false,admissionEnabled:false,tokenExposed:false});
  assert.equal(probes,1);assert.equal(writes,2);
});
test('missing D1 audit receipt never claims canary success',async()=>{
  let probes=0;
  const DB={prepare(sql){return {bind(){return {run:async()=>
    sql.includes('INSERT OR IGNORE')?{meta:{changes:1}}:{meta:{}}};}};}};
  const result=await runGithubAppReadonlyCanary({...control(),DB},{
    nowMs:NOW,probeImpl:async()=>{probes++;return {ok:true,githubApiCalls:2};}
  });
  assert.equal(result.ok,false);assert.equal(result.reason,'audit_unavailable');
  assert.equal(probes,1);
});
test('missing migration, invalid time and D1 write error fail closed',async()=>{
  let c=0;const malformed={prepare(){throw Error('private D1 details')}};
  const e={...control(),DB:malformed};
  for(const nowMs of [NOW,0,8640000000000001]){
    const p=await runGithubAppReadonlyCanary(e,{
      nowMs,probeImpl:async()=>{c++;return{ok:true}}
    });
    assert.equal(p.ok,false);
    assert.doesNotMatch(JSON.stringify(p),/private D1 details/);
  }
  assert.equal(c,0);
});
test('readiness read model never returns secrets or fabricates current quota',async t=>{
  const {native,DB}=await sqliteDB();t.after(()=>native.close());
  const env={...control(),DB};
  assert.equal(githubProbeConfigured(env),true);
  let d=await githubProbeReadModel(env);
  assert.equal(d.state,'ready_unverified');
  assert.equal(d.latest,null);
  assert.equal(d.githubApiCalls,0);
  await runGithubAppReadonlyCanary(env,{nowMs:NOW,probeImpl:async()=>({
    ok:false,reason:'token_exchange_denied',githubApiCalls:1
  })});
  d=await githubProbeReadModel(env);
  assert.equal(d.latest.state,'denied');
  assert.equal(d.latest.githubApiCalls,1);
  assert.ok(!JSON.stringify(d).includes(env.EKODI_GITHUB_APP_PRIVATE_KEY));
});
test('super-admin and same-origin CSRF gate protect manual invocation in Control API',async()=>{
  const [api,html,js,probe]=await Promise.all([
    readFile(new URL('../ai-command-control.js',import.meta.url),'utf8'),
    readFile(new URL('../control.html',import.meta.url),'utf8'),
    readFile(new URL('../control.js',import.meta.url),'utf8'),
    readFile(new URL('../github-app-probe-control.js',import.meta.url),'utf8')
  ]);
  assert.match(api,/PREFIX \+ '\/github\/readonly-probe'/);
  assert.match(api,/requirePlatformSuperAdmin\('ai:operate'\)/);
  assert.match(api,/isSameOriginAdminMutation\(request\)/);
  assert.match(api,/GITHUB_PROBE_CONFIRMATION_REQUIRED/);
  assert.match(api,/runGithubAppReadonlyCanary\(env\)/);
  assert.match(html,/id="githubProbeRun" disabled/);
  assert.match(js,/confirm\('에코디 GitHub App/);
  assert.match(probe,/INSERT OR IGNORE INTO github_app_probe_attempts/);
  assert.doesNotMatch(probe,/\/statuses\/|workflow_dispatch|merge_method/);
});
