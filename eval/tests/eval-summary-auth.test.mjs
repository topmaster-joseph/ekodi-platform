import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import authWorker from '../../auth-worker.js';
import {handleAiEvalSummary} from '../../ai-eval-control.js';

const endpoint='https://ekodi.kr/api/control/ai/eval/summary';
const request=(method='GET')=>new Request(endpoint,{method});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
async function withSession(mockResponse,callback) {
  const m=mock.method(authWorker,'fetch',async()=>mockResponse);
  try{return await callback()}finally{m.mock.restore()}
}
test('unverified session returns 401 and does not disclose data',async()=>{
  await withSession(response({authenticated:false},401),async()=>{
    const r=await handleAiEvalSummary(request(),{DB:{}});
    assert.equal(r.status,401);
    assert.equal((await r.json()).error,'AUTH_REQUIRED');
    assert.match(r.headers.get('cache-control'),/no-store/);
  });
});
test('non-super-admin session remains forbidden',async()=>{
  await withSession(response({authenticated:true,role:'site_admin'}),async()=>{
    const r=await handleAiEvalSummary(request(),{DB:{}});
    assert.equal(r.status,403);
    assert.equal((await r.json()).error,'SUPER_ADMIN_REQUIRED');
  });
});
test('session verifier transport fault fails closed',async()=>{
  await withSession(response({error:'backend unavailable'},503),async()=>{
    const r=await handleAiEvalSummary(request(),{DB:{}});
    assert.equal(r.status,503);
    assert.equal((await r.json()).error,'AUTH_SESSION_UNAVAILABLE');
  });
});
test('recognized super admin gets aggregate-only unverified scorecard',async()=>{
  const rows={
    ai_provider_routing_events:[{provider_id:'cloudflare-workers-ai',tries:50,ok:47,failed:3}],
    routing_daily:[{day:'2026-11-03',tries:50,ok:47}],
    task_states:[{state:'completed',older7d:0,last7d:2},{state:'assigned',older7d:1,last7d:3}],
  };
  const db={prepare(sql){let data;if(sql.includes('GROUP BY provider_id'))data=rows.ai_provider_routing_events;else if(sql.includes('AS day'))data=rows.routing_daily;else if(sql.includes('FROM ekodi_orchestrator_tasks'))data=rows.task_states;else throw Error('Unexpected query');return {bind(){return this},async all(){return {results:data}}}}};
  await withSession(response({authenticated:true,role:'super_admin'}),async()=>{
    const r=await handleAiEvalSummary(request(),{DB:db});
    assert.equal(r.status,200);
    const body=await r.json();
    assert.equal(body.status,'needs-goldens-and-calibration');
    assert.equal(body.sampleCount,0);
    assert.equal(body.provenance.independentVerifier,null);
    assert.equal(body.operational.providers[0].attempted,50);
    assert.equal(body.rows.length,0);
    assert(!JSON.stringify(body).includes('password'));
    assert.match(r.headers.get('cache-control'),/no-store/);
  });
});
test('missing storage cannot masquerade as quality benchmark',async()=>{
  await withSession(response({authenticated:true,role:'super_admin'}),async()=>{
    const r=await handleAiEvalSummary(request(),{});
    assert.equal(r.status,503);
    assert.equal((await r.json()).error,'EVAL_OBSERVATION_DB_UNAVAILABLE');
  });
});
test('non-GET and unrelated routes are rejected without auth calls',async()=>{
  const denied=await handleAiEvalSummary(request('POST'),{});
  assert.equal(denied.status,405);
  assert.equal(await handleAiEvalSummary(new Request('https://ekodi.kr/api/health'),{}),null);
});
