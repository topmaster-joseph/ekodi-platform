import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../my-worker.js';
const env={ASSETS:{fetch:async()=>new Response('not found',{status:404})}};
test('My EKODI exposes the canonical capability sources without tracked projections',async()=>{
 const registry=await (await worker.fetch(new Request('https://my.ekodi.kr/capability-registry.json'),env)).json();
 const packs=await (await worker.fetch(new Request('https://my.ekodi.kr/workspace-packs.json'),env)).json();
 assert.equal(registry.name,'EKODI Universal Capability Registry');assert.equal(packs.defaultPack,'personal-starter');
});
test('My EKODI Intent OS returns a capability-first plan without executing it',async()=>{
 const request=new Request('https://my.ekodi.kr/api/intent/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'상인회 회원 행사와 홍보를 준비해줘',audience:'organization'})});
 const response=await worker.fetch(request,env);const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.ok,true);assert.equal(body.contract,'ekodi.intent-plan.v1');
 assert.equal(body.recommendations[0]?.id,'organization');assert.ok(body.capabilities.some(item=>item.id==='community.events'));
 assert.ok(body.capabilities.some(item=>item.id==='core.automation'));assert.equal(body.execution,'plan_only_until_server_authority_revalidation');
 assert.equal(body.autonomyPolicyVersion,'1.8.1');assert.equal(body.authorityContext,'Person + Workspace + Role + Capability');
});
test('Intent OS preserves sovereign gates for high-impact capabilities',async()=>{
 const request=new Request('https://my.ekodi.kr/api/intent/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'무역 거래와 계약을 준비해줘',audience:'business'})});
 const body=await (await worker.fetch(request,env)).json();assert.ok(body.humanGateCapabilities.includes('trade.operations'));assert.ok(body.humanGateCapabilities.includes('commerce.market'));
});
test('Intent OS rejects empty or oversized requests before routing',async()=>{const empty=await worker.fetch(new Request('https://my.ekodi.kr/api/intent/plan',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env);assert.equal(empty.status,400);const large=await worker.fetch(new Request('https://my.ekodi.kr/api/intent/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'가'.repeat(1201)})}),env);assert.equal(large.status,400)});
