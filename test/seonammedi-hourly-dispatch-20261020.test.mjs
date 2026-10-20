import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dispatchSeonamMediRunner,SEONAMMEDI_RUNNER_WORKFLOW} from '../seonammedi-monitor.js';

// GitHub schedules are throttled here (overnight gap 02:39-09:16 KST on
// 2026-10-20); the reliable hourly Worker cron wakes the runner crawl.

test('without a token the cron does nothing',async()=>{
  let called=false;
  assert.deepEqual(await dispatchSeonamMediRunner({},{fetchImpl:async()=>{called=true}}),{ok:false,skipped:'dispatch_token_not_configured'});
  assert.equal(called,false);
});

test('dispatches the runner workflow on main with the token',async()=>{
  const calls=[];
  const r=await dispatchSeonamMediRunner({SEONAMMEDI_DISPATCH_TOKEN:'tok'},{fetchImpl:async(url,o)=>{calls.push({url,o});return new Response(null,{status:204})}});
  assert.deepEqual(r,{ok:true,dispatched:true});
  assert.equal(calls[0].url,'https://api.github.com/repos/topmaster-joseph/ekodi-platform/actions/workflows/'+SEONAMMEDI_RUNNER_WORKFLOW+'/dispatches');
  assert.equal(calls[0].o.method,'POST');
  assert.equal(calls[0].o.headers.authorization,'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].o.body),{ref:'main'});
});

test('GitHub errors and network failures are reported, never thrown',async()=>{
  assert.deepEqual(await dispatchSeonamMediRunner({SEONAMMEDI_DISPATCH_TOKEN:'t'},{fetchImpl:async()=>new Response('',{status:401})}),{ok:false,error:'github_http_401'});
  const r=await dispatchSeonamMediRunner({SEONAMMEDI_DISPATCH_TOKEN:'t'},{fetchImpl:async()=>{throw new Error('net')}});
  assert.equal(r.ok,false);
  assert.match(r.error,/^github_dispatch_failed/);
});

test('hourly cron wakes the runner and deploy provisions the token secret',async()=>{
  const [worker,workflow]=await Promise.all([
    readFile(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8')
  ]);
  assert.match(worker,/const seonamMediRunnerWake = scheduledAt\.getUTCMinutes\(\) === 0\s*\?\s*dispatchSeonamMediRunner\(env\)/);
  assert.match(worker,/if \(seonamMediRunnerWake\) ctx\.waitUntil\(seonamMediRunnerWake\)/);
  assert.match(workflow,/SEONAMMEDI_DISPATCH_TOKEN: \$\{\{ secrets\.SEONAMMEDI_DISPATCH_TOKEN \}\}/);
  assert.match(workflow,/secret put SEONAMMEDI_DISPATCH_TOKEN --config wrangler\.api\.toml/);
  assert.doesNotMatch(workflow,/echo "\$SEONAMMEDI_DISPATCH_TOKEN"/,'never printed');
});
