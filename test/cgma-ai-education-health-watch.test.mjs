import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkEndpoint,checkCgmaAiEducation,TARGETS,GUARD_ROUTE} from '../scripts/monitor-cgma-ai-education.mjs';
import {routeCgmaAiEducation} from '../cgma-ai-education-route.js';

const noSleep=async()=>{};
const res=(status,route,body='')=>new Response(body,{status,headers:{'x-ekodi-route':route}});
const healthy=async url=>{
  const p=new URL(url).pathname;
  if(p.endsWith('/api/stats'))return res(401,'cgma-ai-education-api','{"error":"login_required"}');
  if(p.endsWith('/app.js'))return res(200,'cgma-ai-education-survey','const questions = [');
  return res(200,'cgma-ai-education-survey','<form id="survey">');
};

test('healthy operating survey passes all checks',async()=>{
  const r=await checkCgmaAiEducation({fetchFn:healthy,sleep:noSleep});
  assert.equal(r.ok,true);assert.equal(r.gatewayBypass,false);
  assert.equal(r.results.length,TARGETS.length);
});

test('the real retired guard response is detected as gateway_bypass without retrying it away',async()=>{
  let calls=0;
  const viaGuard=async url=>{calls++;const o=console.error;console.error=()=>{};try{return await routeCgmaAiEducation(new Request(url))}finally{console.error=o}};
  const r=await checkCgmaAiEducation({fetchFn:viaGuard,sleep:noSleep});
  assert.equal(r.ok,false);assert.equal(r.gatewayBypass,true);
  assert.ok(r.results.every(x=>x.reason==='gateway_bypass'));
  assert.equal(calls,TARGETS.length,'guard answers are not retried');
  const guard=await (async()=>{const o=console.error;console.error=()=>{};try{return await routeCgmaAiEducation(new Request('https://ekodi.kr/cgma/ai-education/'))}finally{console.error=o}})();
  assert.equal(guard.headers.get('x-ekodi-route'),GUARD_ROUTE);
  assert.equal(guard.headers.get('x-ekodi-anomaly'),'cgma-gateway-bypass');
});

test('exposed private statistics and wrong route owners fail',async()=>{
  const exposed=await checkEndpoint(TARGETS[2],{fetchFn:async()=>res(200,'cgma-ai-education-api','{}'),sleep:noSleep});
  assert.equal(exposed.ok,false);assert.equal(exposed.reason,'private_statistics_exposed');
  const stale=await checkEndpoint(TARGETS[0],{fetchFn:async()=>res(200,'other','<form id="survey">'),sleep:noSleep});
  assert.equal(stale.reason,'unexpected_route_owner');
  const marker=await checkEndpoint(TARGETS[1],{fetchFn:async()=>res(200,'cgma-ai-education-survey','const qs=['),sleep:noSleep});
  assert.equal(marker.reason,'operating_survey_marker_missing');
});

test('transient upstream errors are retried with bounded attempts',async()=>{
  let n=0;
  const flaky=async url=>(++n<3?res(502,''):healthy(url));
  const r=await checkEndpoint(TARGETS[0],{fetchFn:flaky,sleep:noSleep});
  assert.equal(r.ok,true);assert.equal(n,3);
  const down=await checkEndpoint(TARGETS[0],{fetchFn:async()=>{throw new TypeError('x')},sleep:noSleep});
  assert.equal(down.reason,'network_or_parse_error');
});

test('hourly watch is read-only and opens/resolves a single incident',()=>{
  const wf=readFileSync(new URL('../.github/workflows/cgma-ai-education-health-watch.yml',import.meta.url),'utf8');
  assert.match(wf,/cron: '23 \* \* \* \*'/);
  assert.match(wf,/contents: read/);
  assert.match(wf,/issues: write/);
  assert.match(wf,/persist-credentials: false/);
  assert.match(wf,/node scripts\/monitor-cgma-ai-education\.mjs/);
  assert.match(wf,/EKODI_CGMA_AI_EDUCATION_WATCH_V1/);
  assert.match(wf,/gateway_bypass/);
  assert.doesNotMatch(wf,/secrets\./);
});

test('monitor never posts survey answers',()=>{
  const src=readFileSync(new URL('../scripts/monitor-cgma-ai-education.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/method:\s*'(POST|PUT|DELETE|PATCH)'/);
  assert.doesNotMatch(src,/\/api\/responses/);
});
