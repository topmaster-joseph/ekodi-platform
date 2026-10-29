import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GitHubRateDeferredError, parseRetryAfter, inspectGitHubBudget, createGitHubBudgetClient
} from '../scripts/github-api-budget-guard.mjs';
const now = Date.parse('2026-10-29T00:00:00Z');
const headers = o => ({ get: k => Object.entries(o).find(([x]) => x.toLowerCase() === k)?.[1] ?? null });
const response = (status, body, h = {}) => ({ status, ok: status >= 200 && status < 300,
  headers: headers(h), json: async () => body });
const args = { repo: 'topmaster-joseph/ekodi-platform', token: 'unit-test-token', now: () => now };

test('retry-after handles both seconds and HTTP dates without guessing an earlier time',()=>{
  assert.equal(parseRetryAfter('9',now),now+9000);
  assert.equal(parseRetryAfter(new Date(now+7000).toUTCString(),now),now+7000);
  assert.equal(parseRetryAfter('n/a',now),null);
});

test('primary and secondary rate limits protect remaining budget',()=>{
  const p=inspectGitHubBudget({status:403,headers:headers({
    'x-ratelimit-remaining':'0','x-ratelimit-reset':String(Math.floor((now+78000)/1000))
  }),body:{message:'API rate limit exceeded for installation'},nowMs:now});
  assert.equal(p.limited,true);
  assert.equal(p.until,now+78000);
  const s=inspectGitHubBudget({status:429,headers:headers({'retry-after':'120'}),
    body:{message:'secondary rate limit'},nowMs:now});
  assert.equal(s.limited,true);
  assert.equal(s.until,now+120000);
  const permission=inspectGitHubBudget({status:403,headers:headers({}),
    body:{message:'Resource not accessible by integration'},nowMs:now});
  assert.equal(permission.limited,false);
  assert.equal(permission.until,0);
});

test('blocked installation causes zero repeated requests, without marking success',async()=>{
  let calls=0;
  const client=createGitHubBudgetClient({...args,fetchImpl:async()=>{
    calls++;return response(403,{message:'API rate limit exceeded for installation'},{
      'x-ratelimit-remaining':'0','x-ratelimit-reset':String(Math.floor((now+120000)/1000))
    });
  }});
  await assert.rejects(client.json('/pulls/12'),e=>e instanceof GitHubRateDeferredError);
  await assert.rejects(client.json('/pulls/12'),e=>e.code==='EKODI_GITHUB_RATE_DEFERRED');
  assert.equal(calls,1);
  assert.equal(client.snapshot().blocked,1);
});

test('ordinary permissions error remains an error, never a quota delay or success',async()=>{
  const client=createGitHubBudgetClient({...args,fetchImpl:async()=>response(403,
    {message:'Resource not accessible by integration'})});
  await assert.rejects(client.json('/statuses/'+'a'.repeat(40),{method:'POST'}),
    /GitHub API HTTP 403/);
  assert.equal(client.snapshot().until,0);
});

test('inflight GET requests are coalesced, POST writes are never cached',async()=>{
  let calls=0;
  const client=createGitHubBudgetClient({...args,cacheMs:3000,fetchImpl:async()=>{
    calls++;await Promise.resolve();return response(200,{ok:true},{'x-ratelimit-remaining':'90'});
  }});
  await Promise.all([client.json('/pulls/5'),client.json('/pulls/5')]);
  await client.json('/pulls/5');
  assert.equal(calls,1);
  await client.json('/statuses/'+'b'.repeat(40),{method:'POST',body:'{}'});
  await client.json('/statuses/'+'b'.repeat(40),{method:'POST',body:'{}'});
  assert.equal(calls,3);
});

test('low remaining quota rejects another request, without bypassing required verification',async()=>{
  let calls=0;
  const client=createGitHubBudgetClient({...args,reserve:5,fetchImpl:async()=>{
    calls++;return response(200,{ok:true},{'x-ratelimit-remaining':'4',
      'x-ratelimit-reset':String(Math.floor((now+90000)/1000))});
  }});
  await client.json('/pulls/5');
  await assert.rejects(client.json('/commits/'+'a'.repeat(40)+'/status'),/deferred/);
  assert.equal(calls,1);
});

test('external URLs and paths with traversal are rejected',async()=>{
  const client=createGitHubBudgetClient({...args,fetchImpl:async()=>{throw Error('should not call')}});
  await assert.rejects(client.json('//evil/path'),/path outside/);
  await assert.rejects(client.json('/../foo'),/path outside/);
  await assert.rejects(client.json('https://elsewhere.com'),/path outside/);
});

test('recovery script is wired to budget guard, not a direct unbounded fetch loop',async()=>{
  const fs=await import('node:fs/promises');
  const body=await fs.readFile(new URL('../scripts/recover-required-status-drift.mjs',import.meta.url),'utf8');
  assert.match(body,/createGitHubBudgetClient/);
  assert.match(body,/client\.json/);
  assert.match(body,/prior\.target_url === source\.target_url/);
  assert.doesNotMatch(body,/const response = await fetch\('https:\/\/api\.github\.com/);
});
