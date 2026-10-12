import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import aiWorker from '../ai-control-worker.js';

const common=fs.readFileSync(new URL('../common-services-admin.js',import.meta.url),'utf8');
const handoff=fs.readFileSync(new URL('../admin-central-handoff.js',import.meta.url),'utf8');
const start=common.indexOf('async function centralSessionInvalid(){');
const end=common.indexOf('const control=',start);
assert.ok(start>0&&end>start,'extract common service runtime authentication policy');
const source=common.slice(start,end);
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});

async function exercise({serviceStatus=200,centralStatus=200,centralData={authenticated:true,role:'super_admin'},serviceData={ok:true}}={}){
  const events=[],logouts=[];
  const context={
    CONTROL:'https://ekodi.kr',
    token:()=> 'live-central-admin-token',
    authHeaders:()=>({authorization:'Bearer live-central-admin-token'}),
    fetch:async(url,init)=>{
      events.push({url:String(url),authorization:init?.headers?.authorization});
      if(String(url).endsWith('/api/session'))return respond(centralData,centralStatus);
      if(String(url).includes('/ai/api/'))return respond(serviceData,serviceStatus);
      throw new Error('unexpected_url:'+url);
    },
    window:{EKODIAdminCore:{showLogin:msg=>logouts.push(msg)}},
  };
  const action=vm.runInNewContext(source+'\njsonFetch',context);
  let value,error;
  try{value=await action('/ai/api/status')}catch(e){error=e}
  return{value,error,events,logouts};
}

test('authenticated admin retains login when common AI returns 403 capability denied',async()=>{
  const r=await exercise({serviceStatus:403,serviceData:{error:'capability_required'}});
  assert.equal(r.error?.status,403);
  assert.match(r.error?.message||'',/권한/);
  assert.deepEqual(r.logouts,[]);
  assert.equal(r.events.length,1);
});
test('401 in AI service does not remove an independently valid central Admin session',async()=>{
  const r=await exercise({serviceStatus:401,serviceData:{error:'invalid_session'}});
  assert.equal(r.error?.status,401);
  assert.match(r.error?.message||'',/관리자 로그인은 유지/);
  assert.deepEqual(r.logouts,[]);
  assert.equal(r.events.length,2);
  assert.equal(r.events[1].url,'https://ekodi.kr/api/session');
  assert.equal(r.events[1].authorization,'Bearer live-central-admin-token');
});
test('central 401 really expires administrator login after AI 401',async()=>{
  const r=await exercise({serviceStatus:401,centralStatus:401,centralData:{error:'invalid_session'}});
  assert.equal(r.error?.message,'admin_session_required');
  assert.equal(r.logouts.length,1);
});
test('central identity API temporarily unavailable never forces another login',async()=>{
  const r=await exercise({serviceStatus:401,centralStatus:503,centralData:{error:'unavailable'}});
  assert.equal(r.error?.status,401);
  assert.deepEqual(r.logouts,[]);
});
test('common AI 503 keeps administrator session and reports downstream availability failure',async()=>{
  const r=await exercise({serviceStatus:503,serviceData:{error:'central_identity_unavailable'}});
  assert.equal(r.error?.status,503);
  assert.equal(r.error?.message,'central_identity_unavailable');
  assert.deepEqual(r.logouts,[]);
});
test('central Admin handoff checks explicit authenticated response',()=>{
  assert.match(handoff,/if\(result\.authenticated!==true\)return showLogin\('관리자 세션 확인 필요 · 다시 로그인'\)/);
});
test('AI control returns service unavailable instead of false invalid_session on central 503',async()=>{
  const original=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async(url)=>{
    requests.push(String(url));
    if(String(url).endsWith('/api/session'))return respond({error:'upstream_busy'},503);
    throw new Error('must not attempt legacy auth after central 503');
  };
  try{
    const response=await aiWorker.fetch(new Request('https://ai.internal/api/status',{
      headers:{authorization:'Bearer central-session'}
    }),{SUPABASE_URL:'https://not-used.example',SUPABASE_PUBLISHABLE_KEY:'not-used'},{waitUntil(){}});
    assert.equal(response.status,503);
    assert.equal((await response.json()).error,'central_identity_unavailable');
    assert.deepEqual(requests,['https://ekodi.kr/api/session']);
  }finally{globalThis.fetch=original}
});
test('AI control returns service unavailable when central verification throws network error',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('network down')};
  try{
    const response=await aiWorker.fetch(new Request('https://ai.internal/api/status',{
      headers:{authorization:'Bearer central-session'}
    }),{},{waitUntil(){}});
    assert.equal(response.status,503);
    assert.equal((await response.json()).error,'central_identity_unavailable');
  }finally{globalThis.fetch=original}
});
