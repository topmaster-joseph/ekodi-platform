import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  canRetryShellStageTransport,runShellStageWithTransportRetry,
  SHELL_STAGE_RETRY_DELAY_MS,SHELL_STAGE_MAX_ATTEMPTS,
} from '../scripts/shell-staging-transient-retry.mjs';

const transient=[
  'Received a malformed response from the API',
  'upstream connect error or disconnect/reset before headers. reset reason: connection termination',
  'Cloudflare Ray ID: example-SEA',
].join('\n');

test('only explicit Cloudflare upstream malformed response is retryable',()=>{
  assert.equal(canRetryShellStageTransport(transient),true);
  for(const invalid of [
    '',
    null,
    'Network connection failed',
    'Received a malformed response from the API',
    'upstream connect error or disconnect/reset before headers',
    transient+'\nHTTP 429 rate limited',
    transient+'\nError 1027 quota exhausted',
    transient+'\nHTTP 403 permission denied',
    transient+'\nHTTP 401 Unauthorized',
    transient+'\nInvalid token',
    transient+'\nToo many requests',
  ])assert.equal(canRetryShellStageTransport(invalid),false,String(invalid));
});

test('first success returns without sleeping',async()=>{
  const delays=[];
  let attempts=0;
  const result=await runShellStageWithTransportRetry({
    run:async()=>{attempts++;return {code:0,output:''};},
    sleep:async ms=>delays.push(ms),
  });
  assert.deepEqual(result,{ok:true,attempts:1,transportRecovered:false});
  assert.equal(attempts,1);assert.deepEqual(delays,[]);
});

test('one transient reset permits exactly one delayed staging attempt',async()=>{
  let attempts=0;const delays=[];
  const result=await runShellStageWithTransportRetry({
    run:async()=>++attempts===1?{code:1,output:transient}:{code:0,output:''},
    sleep:async ms=>delays.push(ms),
    log:()=>{},
  });
  assert.equal(result.attempts,SHELL_STAGE_MAX_ATTEMPTS);
  assert.deepEqual(delays,[SHELL_STAGE_RETRY_DELAY_MS]);
  assert.equal(result.transportRecovered,true);
});

test('repeated transient failure stops, never promote production',async()=>{
  let attempts=0;
  await assert.rejects(runShellStageWithTransportRetry({
    run:async()=>{attempts++;return {code:1,output:transient};},
    sleep:async()=>{},
    log:()=>{},
  }),/stop without production promotion/);
  assert.equal(attempts,SHELL_STAGE_MAX_ATTEMPTS);
});

test('quota or authorization failure never retries, even when mixed with upstream text',async()=>{
  for(const suffix of ['HTTP 429','Error 1027 quota exhausted','HTTP 403','invalid token']){
    let attempts=0;
    await assert.rejects(runShellStageWithTransportRetry({
      run:async()=>{attempts++;return {code:1,output:transient+'\n'+suffix};},
      sleep:async()=>{throw new Error('unexpected sleep');},
    }),/fail-closed/);
    assert.equal(attempts,1);
  }
});

test('spawn errors propagate unchanged without retry',async()=>{
  await assert.rejects(runShellStageWithTransportRetry({
    run:async()=>{throw new Error('npx missing');},
  }),/npx missing/);
});

test('workflow remains strictly staging-only and preserves guarded production',()=>{
  const wf=readFileSync(new URL('../.github/workflows/deploy-ekodi-shell.yml',import.meta.url),'utf8');
  const runner=readFileSync(new URL('../scripts/shell-staging-transient-retry.mjs',import.meta.url),'utf8');
  assert.match(wf,/Deploy isolated Shell staging[\s\S]{0,120}node scripts\/shell-staging-transient-retry\.mjs/);
  assert.match(wf,/needs: \[validate, staging\]/);
  assert.match(wf,/Verify real Shell hostname with release cache busting/);
  assert.match(wf,/EKODI AI Orchestration Gate/);
  assert.match(runner,/wrangler\.shell\.staging\.toml/);
  assert.doesNotMatch(runner,/wrangler\.shell\.toml|versions deploy|--env production|rate.limit.*override/i);
});
