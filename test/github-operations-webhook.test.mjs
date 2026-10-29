import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  verifyGitHubSignature, eventOperationKey, projectGitHubEvent,
  acceptGitHubWebhook, drainGitHubObservations
} from '../github-operations-webhook.js';

const secret='github-webhook-test-secret-with-more-than-32-bytes';
const repo='topmaster-joseph/ekodi-platform';
const delivery='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const payload={repository:{full_name:repo},installation:{id:1234},action:'completed',
  workflow_run:{id:123,run_attempt:1,head_sha:'a'.repeat(40),conclusion:'success'}};
const env={EKODI_GITHUB_WEBHOOK_ENABLED:'true',EKODI_GITHUB_WEBHOOK_SECRET:secret,
  EKODI_GITHUB_INSTALLATION_ID:'1234'};

async function signedRequest(body=payload,headers={}) {
  const raw=JSON.stringify(body);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,
    new TextEncoder().encode(raw))),x=>x.toString(16).padStart(2,'0')).join('');
  return new Request('https://ekodi.kr/api/orchestrator/github/webhook',{
    method:'POST',
    headers:{'content-type':'application/json',
      'x-github-delivery':delivery,'x-github-event':'workflow_run',
      'x-hub-signature-256':'sha256='+signature,...headers},
    body:raw,
  });
}

test('HMAC must match raw bytes; malformed and forged signatures fail', async()=>{
  const bytes=new TextEncoder().encode('{"ok":true}');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes)),
    x=>x.toString(16).padStart(2,'0')).join('');
  assert.equal(await verifyGitHubSignature(bytes.buffer,'sha256='+signature,secret),true);
  assert.equal(await verifyGitHubSignature(new TextEncoder().encode('modified'),
    'sha256='+signature,secret),false);
  assert.equal(await verifyGitHubSignature(bytes.buffer,'sha256='+'0'.repeat(64),secret),false);
});

test('webhook must remain disabled without owner-provisioned secret and installation',async()=>{
  assert.equal((await acceptGitHubWebhook(await signedRequest(),
    {...env,EKODI_GITHUB_WEBHOOK_ENABLED:'false'})).status,503);
  assert.equal((await acceptGitHubWebhook(await signedRequest(),
    {...env,EKODI_GITHUB_WEBHOOK_SECRET:''})).status,503);
  assert.equal((await acceptGitHubWebhook(await signedRequest(),
    {...env,EKODI_GITHUB_INSTALLATION_ID:''})).status,503);
});

test('foreign repositories, installations, browser requests and oversized bodies fail',async()=>{
  assert.equal((await acceptGitHubWebhook(await signedRequest(
    {...payload,repository:{full_name:'other/repo'}}),env)).status,403);
  assert.equal((await acceptGitHubWebhook(await signedRequest(
    {...payload,installation:{id:9999}}),env)).status,403);
  assert.equal((await acceptGitHubWebhook(await signedRequest(payload,
    {origin:'https://ekodi.kr'}),env)).status,403);
  assert.equal((await acceptGitHubWebhook(await signedRequest(payload,
    {'content-length':'262145'}),env)).status,413);
  assert.equal((await acceptGitHubWebhook(await signedRequest(payload,
    {'x-hub-signature-256':'sha256='+'0'.repeat(64)}),env)).status,401);
});

test('event key is deterministic across retransmissions; event projection has no user payload',async()=>{
  const key=await eventOperationKey('workflow_run',payload);
  assert.equal(key,await eventOperationKey('workflow_run',payload));
  assert.notEqual(key,await eventOperationKey('workflow_run',{...payload,action:'requested'}));
  assert.equal(key.length,64);
  const projected=projectGitHubEvent('workflow_run',payload);
  assert.equal(projected.repository,repo);
  assert.equal(projected.headSha,'a'.repeat(40));
  assert.ok(!('body' in projected));
});

test('authenticated event is inserted once, but replay is acknowledged without GitHub writes',async()=>{
  const deliverySet=new Set();let inserts=0;let jobs=0;
  const DB={prepare(sql){return {bind(...args){return{async run(){
    if(sql.includes('github_operations_webhook_events')){
      if(deliverySet.has(args[0]))return{meta:{changes:0}};
      deliverySet.add(args[0]);inserts++;return{meta:{changes:1}};
    }
    jobs++;return{meta:{changes:1}};
  }}}}}};
  const first=await acceptGitHubWebhook(await signedRequest(),{...env,DB});
  assert.equal(first.status,202);
  const firstJson=await first.json();
  assert.equal(firstJson.releaseAuthorized,false);
  assert.equal(firstJson.githubApiCalls,0);
  const replay=await acceptGitHubWebhook(await signedRequest(),{...env,DB});
  assert.equal(replay.status,200);
  assert.equal((await replay.json()).duplicate,true);
  assert.equal(inserts,1);
  assert.equal(jobs,2);
});

test('observation-only drain performs zero GitHub API calls and deploys nothing',async()=>{
  const DB={prepare(){return {bind(){return {
    all:async()=>({results:[{operation_key:'abc'}]}),
    run:async()=>({meta:{changes:1}})
  }}}}};
  assert.deepEqual(await drainGitHubObservations({DB}),{
    processed:1,githubApiCalls:0,deployments:0
  });
});

test('canonical route and server-side super-admin API guard remain required',async()=>{
  const entry=await readFile(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
  const control=await readFile(new URL('../ai-command-control.js',import.meta.url),'utf8');
  const migration=await readFile(new URL('../migrations/202610290930_github_operations_control.sql',import.meta.url),'utf8');
  assert.match(entry,/acceptGitHubWebhook/);
  assert.match(control,/requirePlatformSuperAdmin\('ai:read'\)/);
  assert.match(control,/githubOperationsSnapshot/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS github_operations_webhook_events/);
  assert.match(migration,/operation_key TEXT NOT NULL UNIQUE/);
  assert.doesNotMatch(migration,/GITHUB_TOKEN|SECRET_KEY|access_token/);
});
