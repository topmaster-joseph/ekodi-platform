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


test('conditional authorized ETag reuses validated JSON only on unchanged 304',async()=>{
  let calls=0;const seen=[];const metrics=[];
  const client=createGitHubBudgetClient({...args,cacheMs:0,onMetric:m=>metrics.push(m),fetchImpl:async(_url,opts)=>{
    seen.push(opts.headers);
    calls++;
    if(calls===1)return response(200,{statuses:[{context:'test',state:'pending'}]},{
      etag:'"head-status-v1"','x-ratelimit-remaining':'300'
    });
    return response(304,null,{'x-ratelimit-remaining':'300'});
  }});
  const one=await client.json('/commits/'+'a'.repeat(40)+'/status');
  const two=await client.json('/commits/'+'a'.repeat(40)+'/status');
  assert.deepEqual(two,one);
  assert.equal(calls,2);
  assert.equal(seen[0]['if-none-match'],undefined);
  assert.equal(seen[1]['if-none-match'],'"head-status-v1"');
  assert.equal(client.snapshot().cacheHits,1);
  assert.ok(metrics.some(m=>m.type==='not_modified'));
});

test('a bare 304 is rejected when no prior authorized 200 result exists',async()=>{
  let calls=0;
  const client=createGitHubBudgetClient({...args,fetchImpl:async()=>{
    calls++;return response(304,null);
  }});
  await assert.rejects(client.json('/commits/'+'a'.repeat(40)+'/status'),
    /unexpected 304/);
  assert.equal(calls,1);
});

test('ETags never cache POST mutations or cross-contaminate other routes',async()=>{
  const seen=[];
  const client=createGitHubBudgetClient({...args,fetchImpl:async(url,opts)=>{
    seen.push({url,headers:opts.headers,method:opts.method||'GET'});
    return response(200,{route:url},{etag:'"route-v1"'});
  }});
  await client.json('/pulls/1');
  await client.json('/pulls/2');
  await client.json('/pulls/1');
  await client.json('/statuses/'+'a'.repeat(40),{method:'POST',body:'{}'});
  await client.json('/statuses/'+'a'.repeat(40),{method:'POST',body:'{}'});
  assert.equal(seen[1].headers['if-none-match'],undefined);
  assert.equal(seen[2].headers['if-none-match'],'"route-v1"');
  assert.equal(seen[3].headers['if-none-match'],undefined);
  assert.equal(seen[4].headers['if-none-match'],undefined);
  assert.equal(client.snapshot().cacheHits,0);
});

test('quota exhausted after a cached ETag still fails closed',async()=>{
  let calls=0;
  const client=createGitHubBudgetClient({...args,fetchImpl:async()=>{
    calls++;
    return calls===1?response(200,{statuses:[]},{etag:'"safe"','x-ratelimit-remaining':'60'}):
      response(403,{message:'API rate limit exceeded for installation'},{
        'x-ratelimit-remaining':'0',
        'x-ratelimit-reset':String(Math.floor((now+120000)/1000))
      });
  }});
  await client.json('/commits/'+'a'.repeat(40)+'/status');
  await assert.rejects(client.json('/commits/'+'a'.repeat(40)+'/status'),
    e=>e instanceof GitHubRateDeferredError);
  await assert.rejects(client.json('/commits/'+'a'.repeat(40)+'/status'),
    e=>e instanceof GitHubRateDeferredError);
  assert.equal(calls,2,'no stale success or repeated quota requests');
});

test('user-supplied identity or conditional headers cannot override client token',async()=>{
  const requests=[];
  const client=createGitHubBudgetClient({...args,fetchImpl:async(_url,opts)=>{
    requests.push(opts);return response(200,{ok:true},{etag:'"verified"'});
  }});
  for(const bad of [
    {Authorization:'Bearer other-user'},
    new Headers({'authorization':'Bearer alternate'}),
    {'If-None-Match':'"fake-proof"'},
    {Accept:'application/vnd.github.raw'},
    {'X-GitHub-Api-Version':'1970-01-01'},
    {'Proxy-Authorization':'Basic secret'},
  ]) {
    await assert.rejects(client.json('/pulls/12',{headers:bad}),/does not allow overriding/);
  }
  assert.equal(requests.length,0,'reject spoofed headers before network I/O');
  await client.json('/pulls/12');
  assert.equal(requests[0].headers.authorization,'Bearer unit-test-token');
});

test('custom-header GETs are never coalesced or validated from route-only ETags',async()=>{
  const calls=[];
  const client=createGitHubBudgetClient({...args,cacheMs:60000,fetchImpl:async(_url,opts)=>{
    calls.push(opts.headers);
    return response(200,{result:calls.length},{etag:'"same-route"'});
  }});
  const cached=await client.json('/pulls/15');
  assert.equal((await client.json('/pulls/15')).result,cached.result);
  const variant=await client.json('/pulls/15',{headers:{'x-ekodi-purpose':'one'}});
  const other=await client.json('/pulls/15',{headers:{'x-ekodi-purpose':'two'}});
  assert.equal(calls.length,3,'first route-only response coalesces only with itself');
  assert.equal(variant.result,2);
  assert.equal(other.result,3);
  assert.equal(calls[1]['if-none-match'],undefined);
  assert.equal(calls[2]['if-none-match'],undefined);
  assert.equal(calls[1]['x-ekodi-purpose'],'one');
  assert.equal(calls[2]['x-ekodi-purpose'],'two');
});
