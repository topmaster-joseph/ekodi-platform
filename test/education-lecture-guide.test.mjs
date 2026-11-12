import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLRewriter??=class{on(){return this;}onDocument(){return this;}transform(response){return response;}};
const {default:worker}=await import('../education-worker.js');
import { createVerifier, mintGateToken, isGatedPath, isStrictPath, GATE_COOKIE } from '../education-instructor-gate.js';
import { FLOW, SESSIONS, FIELDS, PROMPTS } from '../education/study/live/guide/data.js';
import { DEMOS, SESSION_PICKS, demoById, demoPrompt } from '../education/study/live/guide/demos.js';

const KEY='k'.repeat(48);
const VERIFIER=await createVerifier('test-only-pass-7k2m-9qxz',{iterations:10000});
const ASSETS={fetch:async request=>new Response('ASSET '+new URL(request.url).pathname,{status:200,headers:{'content-type':'text/html; charset=utf-8'}})};
const env=(extra={})=>({ASSETS,EDU_INSTRUCTOR_GATE:VERIFIER,EDU_GATE_SIGNING_KEY:KEY,...extra});
const get=(path,init={},e=env())=>worker.fetch(new Request('https://ekodi.kr'+path,init),e);
const GUIDE=['/study/live/guide/','/study/live/guide','/study/live/guide/index.html','/study/live/guide/data.js','/study/live/guide/demos.js','/study/live/guide/guide.js','/study/live/guide/guide.css'];

test('the whole lecture guide tree is strict-gated; other studio surfaces are unchanged',()=>{
  for(const p of GUIDE){assert.ok(isGatedPath(p),p);assert.ok(isStrictPath(p),p);}
  for(const p of ['/study/live/','/study/live/present/','/study/live/lab/','/study/live/guidebook/','/study/live/courses/mnu-factchat-2026.js'])assert.ok(!isStrictPath(p),p);
});

test('open mode does not open the guide: lock page for the page, 401 for its data, no asset leak',async()=>{
  const e=env({EDU_INSTRUCTOR_GATE_MODE:'open'});
  const page=await get('/study/live/guide/',{},e);
  assert.equal(page.status,401);
  assert.match(page.headers.get('cache-control'),/no-store/);
  const html=await page.text();
  assert.match(html,/강사용 세부 강의안/);assert.match(html,/에코디 계정으로 열기/);assert.doesNotMatch(html,/ASSET/);
  assert.doesNotMatch(html,/실습실로 가기/,'no learner links on the guide lock page');
  for(const p of ['/study/live/guide/data.js','/study/live/guide/demos.js']){const r=await get(p,{},e);assert.equal(r.status,401,p);assert.doesNotMatch(await r.text(),/ASSET/,p);}
  // the studio itself stays open in open mode
  const studio=await get('/study/live/',{},e);assert.equal(studio.status,200);
});

test('an instructor session (signed cookie) opens the guide and its modules, never cached',async()=>{
  const cookie=GATE_COOKIE+'='+await mintGateToken(KEY);
  for(const p of GUIDE){
    const r=await get(p,{headers:{cookie}},env({EDU_INSTRUCTOR_GATE_MODE:'open'}));
    assert.equal(r.status,200,p);assert.match(await r.text(),/ASSET/,p);
    assert.match(r.headers.get('cache-control'),/no-store/,p);
  }
  const forged=await get('/study/live/guide/',{headers:{cookie:GATE_COOKIE+'=v1.9999999999.'+'A'.repeat(43)}});
  assert.equal(forged.status,401);
});

test('without a signing key the guide fails closed',async()=>{
  const r=await get('/study/live/guide/',{},env({EDU_GATE_SIGNING_KEY:''}));
  assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/ASSET/);
});

test('lecture content: 6 sessions × 180 minutes, consistent counts, valid demo picks, no names',()=>{
  assert.equal(SESSIONS.length,6);
  assert.equal(FLOW[0].start,0);assert.equal(FLOW.at(-1).end,180);
  for(let i=1;i<FLOW.length;i++)assert.equal(FLOW[i].start,FLOW[i-1].end,'no gaps '+FLOW[i].id);
  for(const f of FLOW)if(f.phases)assert.equal(f.phases.reduce((a,p)=>a+p[1],0),f.end-f.start,f.id+' phases fill the slot');
  const ids=new Set(FIELDS.map(f=>f.id));
  for(const s of SESSIONS){
    assert.equal(Object.values(s.mix).reduce((a,b)=>a+b,0),s.count,s.no+'차 mix sums to count');
    for(const k of Object.keys(s.mix))assert.ok(ids.has(k),k);
    for(const k of Object.keys(s.notes||{}))assert.ok(FLOW.some(f=>f.id===k),s.no+'차 note '+k);
    const picks=SESSION_PICKS[s.no];assert.ok(picks,s.no+'차 picks');
    for(const [seg,list] of Object.entries(picks)){assert.ok(FLOW.some(f=>f.id===seg),seg);for(const id of list)assert.ok(demoById(id),id);}
  }
  assert.equal(SESSIONS.reduce((a,s)=>a+s.count,0),146);
  for(const f of FIELDS)for(const m of ['hwp','minutes','ppt'])assert.ok(PROMPTS[f.id]?.[m],f.id+' '+m);
  for(const d of DEMOS){assert.ok(d.handoff&&d.points.length&&d.task,d.id);assert.ok(demoPrompt(d).length>20,d.id);}
  assert.equal(new Set(DEMOS.map(d=>d.id)).size,DEMOS.length,'unique demo ids');
});
