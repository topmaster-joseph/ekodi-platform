import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  parseGitHubQuotaObservation,recordTrustedGitHubQuota,
  projectGitHubQuotaRows,githubQuotaReadModel
} from '../github-api-budget-control.js';
import {githubOperationsSnapshot} from '../github-operations-webhook.js';

const NOW=Date.parse('2026-10-30T01:00:00Z');
const RESET=Math.floor((NOW+3600000)/1000);
const headers=new Headers({
  'x-ratelimit-resource':'core','x-ratelimit-limit':'5000',
  'x-ratelimit-remaining':'4732','x-ratelimit-reset':String(RESET)
});

test('only GitHub measured complete numeric headers create quota observations',()=>{
  const observation=parseGitHubQuotaObservation(headers,{observedAtMs:NOW,status:200});
  assert.equal(observation.resource,'core');
  assert.equal(observation.remaining,4732);
  assert.equal(observation.resetAtMs,RESET*1000);
  assert.equal(parseGitHubQuotaObservation({'x-ratelimit-resource':'core'},{
    observedAtMs:NOW,status:429}),null,'never manufacture quota numbers from 429');
  assert.equal(parseGitHubQuotaObservation({...Object.fromEntries(headers),
    'x-ratelimit-remaining':'5001'},{observedAtMs:NOW}),null);
  assert.equal(parseGitHubQuotaObservation(new Headers({...Object.fromEntries(headers),
    'x-ratelimit-resource':'untrusted'}),{observedAtMs:NOW}),null);
});

test('quota rate limit 0 carries actual reset deadline, never invented success',()=>{
  const h=new Headers(headers);h.set('x-ratelimit-remaining','0');
  const point=parseGitHubQuotaObservation(h,{observedAtMs:NOW,status:403});
  assert.equal(point.remaining,0);
  assert.equal(point.blockedUntilMs,RESET*1000);
});

test('untrusted caller and missing response headers cannot mutate D1',async()=>{
  let touched=0;
  const env={DB:{prepare(){touched++;throw Error('must not touch DB');}}};
  await assert.rejects(recordTrustedGitHubQuota(env,{
    installationId:1,headers,status:200,observedAtMs:NOW
  }),/AUTHENTICATED_SOURCE_REQUIRED/);
  await assert.rejects(recordTrustedGitHubQuota(env,{
    installationId:1,headers:{},authenticatedServerCall:true,status:429,observedAtMs:NOW
  }),/VERIFIED_HEADERS_REQUIRED/);
  await assert.rejects(recordTrustedGitHubQuota(env,{
    installationId:-2,headers,authenticatedServerCall:true,status:200,observedAtMs:NOW
  }),/INVALID_INSTALLATION/);
  assert.equal(touched,0);
});

test('trusted server-side observation uses ordered prepared D1 bindings only',async()=>{
  let captured;
  const DB={prepare(sql){return {bind(...values){captured={sql,values};
    return {run:async()=>({meta:{changes:1}})};}};}};
  const result=await recordTrustedGitHubQuota({DB},{
    installationId:123,headers,status:200,observedAtMs:NOW,authenticatedServerCall:true
  });
  assert.deepEqual(result,{accepted:true,resource:'core'});
  assert.ok(captured.sql.includes('ON CONFLICT(installation_id,resource)'));
  assert.ok(captured.sql.includes('excluded.observed_at_ms>github_operations_api_budgets.observed_at_ms'));
  assert.equal(captured.values[0],123);
  assert.equal(captured.values[3],4732);
  assert.doesNotMatch(captured.sql,/ghp_|github_pat_|Bearer/);
});

test('only fresh verified observations display numeric quota; stale is unknown',()=>{
  const row={installation_id:123,resource:'core',limit_value:5000,
    remaining_value:4732,reset_at_ms:RESET*1000,observed_at_ms:NOW,blocked_until_ms:0};
  const fresh=projectGitHubQuotaRows([row],{nowMs:NOW+1000});
  assert.equal(fresh[0].state,'fresh');
  assert.equal(fresh[0].remaining,4732);
  assert.equal(fresh[0].measured,true);
  const stale=projectGitHubQuotaRows([row],{nowMs:NOW+121000});
  assert.equal(stale[0].state,'stale');
  assert.equal(stale[0].remaining,null);
  assert.equal(stale[0].limit,null);
});

test('missing quota migration is treated as not connected, not as zero remaining',async()=>{
  const DB={prepare(){return {all:async()=>{throw Error('no such table');}};}};
  const data=await githubQuotaReadModel({DB},{nowMs:NOW});
  assert.equal(data.state,'schema_unavailable');
  assert.equal(data.enforcement,'not_connected');
  assert.deepEqual(data.buckets,[]);
});

test('authenticated GitHub snapshot separates configured secret from actual signed event',async()=>{
  const queries=[];
  const DB={prepare(sql){queries.push(sql);return {bind(){return {all:async()=>({results:[]})};},
    all:async()=>({results:sql.includes('COUNT(*) as count')?[{count:0}]:[]})};}};
  const data=await githubOperationsSnapshot({
    DB,EKODI_GITHUB_WEBHOOK_ENABLED:'true',
    EKODI_GITHUB_WEBHOOK_SECRET:'a'.repeat(64),
    EKODI_GITHUB_INSTALLATION_ID:'456'
  });
  assert.equal(data.activation.ready,true);
  assert.equal(data.activation.receivingVerifiedEvents,false);
  assert.equal(data.activation.lastSignedEventAt,null);
  assert.equal(data.apiQuota.enforcement,'not_connected');
  assert.equal(data.githubApiRemaining,null);
  assert.ok(queries.some(q=>q.includes('github_operations_api_budgets')));
  assert.ok(!JSON.stringify(data).includes('a'.repeat(64)));
});

test('admin UI displays four independent activation checks and labels unknown quotas',async()=>{
  const ui=await readFile(new URL('../control.js',import.meta.url),'utf8');
  const model=await readFile(new URL('../github-operations-webhook.js',import.meta.url),'utf8');
  const migration=await readFile(new URL('../migrations/202610300110_github_api_budget_observations.sql',import.meta.url),'utf8');
  for(const token of ['Webhook 서버 활성화','서명 비밀키 존재',
    'GitHub App 설치 ID 존재','실제 서명된 이벤트 수신','실측값 만료 · 미확인'])
    assert.ok(ui.includes(token),token);
  assert.match(model,/lastSignedEventAt/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS github_operations_api_budgets/);
  assert.doesNotMatch(migration,/token|secret|password|email/i);
  assert.doesNotMatch(ui,/githubApiToken\s*=/i);
});
