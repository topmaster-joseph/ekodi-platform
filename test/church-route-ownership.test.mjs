import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHURCH_ROUTE_CONTRACT, verifyChurchLive } from '../scripts/ensure-church-route-ownership.mjs';

test('Church route contract avoids the ambiguous no-slash wildcard and verifies live public/admin boundaries',()=>{
  assert.deepEqual(CHURCH_ROUTE_CONTRACT.desiredGateway,['ekodi.kr/ekodichurch','ekodi.kr/ekodichurch/*']);
  assert.equal(CHURCH_ROUTE_CONTRACT.retiredGateway,'ekodi.kr/ekodichurch*');
  assert.equal(CHURCH_ROUTE_CONTRACT.gateway,'ekodi-church-path-gateway');
  assert.equal(CHURCH_ROUTE_CONTRACT.publicUrl,'https://ekodi.kr/ekodichurch/');
  assert.equal(CHURCH_ROUTE_CONTRACT.adminUrl,'https://ekodi.kr/ekodichurch/admin');
  assert.equal(CHURCH_ROUTE_CONTRACT.publicRoute,'church-public-path');
  assert.equal(CHURCH_ROUTE_CONTRACT.adminRoute,'church-pastor-admin');
});

test('Shared Site production workflow repairs Church route ownership before guarded promotion',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  const repair=workflow.indexOf('Enforce canonical Church route ownership');
  const promote=workflow.indexOf('Candidate at 0%, verify routes, promote and auto-rollback on failure');
  assert.ok(repair>0&&promote>repair);
  assert.match(workflow,/node scripts\/ensure-church-route-ownership\.mjs/);
});


test('Church live verification honors edge throttling without accepting 429 as success',async()=>{
  let calls=0;const delays=[];
  const response=(status,route='',retryAfter='')=>({
    status,
    headers:{get(name){if(name==='x-ekodi-route')return route;if(name==='retry-after')return retryAfter;return null;}}
  });
  await verifyChurchLive('https://ekodi.kr/ekodichurch/','church-public-path',{
    attempts:3,
    fetchImpl:async()=>{calls+=1;return calls===1?response(429,'','2'):response(200,'church-public-path');},
    sleep:async ms=>{delays.push(ms);}
  });
  assert.equal(calls,2);
  assert.deepEqual(delays,[2000]);
});

test('Church live verification still fails closed when throttling never clears',async()=>{
  await assert.rejects(
    verifyChurchLive('https://ekodi.kr/ekodichurch/','church-public-path',{
      attempts:2,
      fetchImpl:async()=>({status:429,headers:{get(name){return name==='retry-after'?'0':null;}}}),
      sleep:async()=>{}
    }),
    /HTTP 429/
  );
});
