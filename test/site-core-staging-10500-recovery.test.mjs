import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  mayRetryStaging10500,runStagingWith10500Recovery,
  STAGING_INTERNAL_AUTH_RETRY_DELAY_MS,MAX_STAGING_DEPLOY_ATTEMPTS
} from '../scripts/site-core-staging-10500-recovery.mjs';

const internal10500=[
 'A request to the Cloudflare API',
 '(/accounts/abcdef/workers/scripts/ekodi-shared-site-staging/secrets) failed.',
 'Internal authentication error: internal server error [code: 10500]'
].join('\n');
const event=(code,output='')=>({code,output});

test('Cloudflare staging 10500 is the only eligible internal-auth failure',()=>{
  assert.equal(mayRetryStaging10500(internal10500),true);
  assert.equal(mayRetryStaging10500('env.PLATFORM_SENSITIVE_RATE_LIMITER (120 requests/60s) Rate Limit\n'+internal10500),true,
    'Wrangler may list configured Rate Limit bindings without an actual 429 error');
  for(const item of [
    internal10500+'\nCloudflare HTTP 429',
    internal10500+'\nCloudflare Error 1027 quota exhausted',
    internal10500+'\nrate limiting',
    'Internal authentication error: internal server error [code: 10500]',
    'workers/scripts/ekodi-shared-site/secrets 10500',
    'workers/scripts/ekodi-shared-site-staging/secrets invalid token [code: 10000]',
    'Cloudflare authentication failed: HTTP 403',
    'Cloudflare API error 500',
    '',
    null
  ])assert.equal(mayRetryStaging10500(item),false,'must fail closed for non-10500 cause');
});

test('success on first attempt does not retry or delay',async()=>{
  const waits=[];let attempts=0;
  const result=await runStagingWith10500Recovery({run:async()=>{attempts++;return event(0)},sleep:ms=>waits.push(ms)});
  assert.deepEqual(result,{ok:true,attempts:1,internalAuthRecovered:false});
  assert.equal(attempts,1);assert.deepEqual(waits,[]);
});

test('exact staging secrets API 10500 permits one bounded delayed retry only',async()=>{
  const waits=[];let attempts=0;
  const result=await runStagingWith10500Recovery({
    run:async()=>++attempts===1?event(1,internal10500):event(0),
    sleep:ms=>waits.push(ms),log:()=>{},
  });
  assert.equal(result.attempts,2);
  assert.equal(attempts,MAX_STAGING_DEPLOY_ATTEMPTS);
  assert.deepEqual(waits,[STAGING_INTERNAL_AUTH_RETRY_DELAY_MS]);
});

test('repeated 10500 fails after second attempt and never reaches production',async()=>{
  let attempts=0;const waits=[];
  await assert.rejects(runStagingWith10500Recovery({
    run:async()=>{attempts++;return event(1,internal10500)},
    sleep:ms=>waits.push(ms),log:()=>{},
  }),/10500 persisted/);
  assert.equal(attempts,2);assert.equal(waits.length,1);
});

test('quota, authorization and unknown failures stop immediately without retry',async()=>{
  for(const failure of ['HTTP 429','1027 quota exhausted','Access denied HTTP 403','code: 10000']) {
    let attempts=0;const waits=[];
    await assert.rejects(runStagingWith10500Recovery({
      run:async()=>{attempts++;return event(1,failure)},
      sleep:ms=>waits.push(ms)
    }),/fail-closed/);
    assert.equal(attempts,1);assert.deepEqual(waits,[]);
  }
});

test('after one 10500, second quota error cannot trigger another attempt',async()=>{
  let attempts=0;
  await assert.rejects(runStagingWith10500Recovery({
    run:async()=>++attempts===1?event(1,internal10500):event(1,'HTTP 429'),
    sleep:async()=>{},log:()=>{},
  }),/no further attempts or production promotion/);
  assert.equal(attempts,2);
});

test('transport/program errors propagate unchanged and do not retry',async()=>{
  let attempts=0;
  await assert.rejects(runStagingWith10500Recovery({run:async()=>{
    attempts++;throw new Error('Connection failed');
  }}),/Connection failed/);
  assert.equal(attempts,1);
});

test('staging only workflow uses the pinned guard; production guard and digest remain',()=>{
  const stage=readFileSync(new URL('../.github/workflows/stage-shared-site-shell.yml',import.meta.url),'utf8');
  const prod=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  const runner=readFileSync(new URL('../scripts/site-core-staging-10500-recovery.mjs',import.meta.url),'utf8');
  assert.match(stage,/name: Deploy no-route staging Worker\s*\n\s*# CF-QUOTA-001:[^\n]*\n\s*run: node scripts\/site-core-staging-10500-recovery\.mjs/);
  assert.match(stage,/Rebuild and prove immutable release artifact reproducibility/);
  assert.match(prod,/staging_gate:/);
  assert.match(prod,/Enforce staging-to-production artifact continuity/);
  assert.match(prod,/Candidate at 0%, verify routes, promote and auto-rollback on failure/);
  assert.match(runner,/wrangler\.site-staging\.toml/);
  assert.doesNotMatch(runner,/wrangler\.site\.toml|versions deploy|--env production|rate.limit.*override|sessionStorage|localStorage/i);
});

test('all three protected deployment triggers include this staging-only change',()=>{
 const files=[
  'scripts/converge-orchestrated-pr-merge.mjs',
  'scripts/recover-release-provenance.mjs',
  '.github/workflows/deploy-site-core.yml',
 ];
 for(const path of files){
   const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
   assert.ok(src.includes('scripts/site-core-staging-10500-recovery.mjs'),path+' must dispatch the guarded Site Core');
   assert.ok(src.includes('.github/workflows/stage-shared-site-shell.yml'),path+' must dispatch the guarded Site Core');
 }
});
