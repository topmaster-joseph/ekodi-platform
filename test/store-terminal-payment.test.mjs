import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createTerminalBridge, STORE_TERMINAL_BRIDGE as BRIDGE } from '../store-terminal-bridge.js';
import { handleStoreTerminalPaymentApi, kstDayStartIso } from '../store-terminal-payment-runtime.js';

// ---- Bridge (pure) -------------------------------------------------------

test('vendor adapters stay inert until an official spec is registered',()=>{
  assert.equal(BRIDGE.adapterReady(BRIDGE.adapter('manual')),true);
  assert.equal(BRIDGE.adapterReady(BRIDGE.adapter('kicc_easycheck')),false);
  assert.equal(BRIDGE.adapter('kicc_easycheck').launch,null,'no guessed KICC URL scheme may ship');
  assert.equal(BRIDGE.adapterReady(BRIDGE.adapter('toss_payments')),false);
  assert.equal(BRIDGE.buildLaunch(BRIDGE.adapter('kicc_easycheck'),{amount:1000,requestKey:'pay_abcdef123',returnUrl:'https://ekodi.kr/jadam/admin/mobile'}),null);
  const pub=BRIDGE.publicAdapters();
  assert.deepEqual(pub.map(a=>[a.id,a.ready]),[['manual',true],['kicc_easycheck',false],['toss_payments',false]]);
});

// A fixture adapter shaped like a registered spec (NOT KICC's real scheme).
const FIXTURE={id:'kicc_easycheck',state:'ready',
  launch:{kind:'url',template:'fixturepay://pay?amt={amount}&key={requestKey}&ret={returnUrl}',allowedSchemes:['fixturepay']},
  result:{requestKey:'key',status:'rc',approvalNo:'apno',amount:'amt',approvedValues:['0000'],failedValues:['9999','8000']}};

test('launch URL carries only amount, opaque key and an ekodi.kr https return URL',()=>{
  const url=BRIDGE.buildLaunch(FIXTURE,{amount:'31,500',requestKey:'pay_abcdef123',returnUrl:'https://ekodi.kr/jadam/admin/mobile?pay_return=kicc_easycheck'});
  assert.equal(url,'fixturepay://pay?amt=31500&key=pay_abcdef123&ret='+encodeURIComponent('https://ekodi.kr/jadam/admin/mobile?pay_return=kicc_easycheck'));
  assert.equal(BRIDGE.buildLaunch(FIXTURE,{amount:1000,requestKey:'pay_abcdef123',returnUrl:'https://evil.example/x'}),null);
  assert.equal(BRIDGE.buildLaunch(FIXTURE,{amount:1000,requestKey:'pay_abcdef123',returnUrl:'http://ekodi.kr/x'}),null);
  assert.equal(BRIDGE.buildLaunch(FIXTURE,{amount:0,requestKey:'pay_abcdef123',returnUrl:'https://ekodi.kr/x'}),null);
  assert.equal(BRIDGE.buildLaunch(FIXTURE,{amount:1000,requestKey:'bad key!',returnUrl:'https://ekodi.kr/x'}),null);
  const js={...FIXTURE,launch:{...FIXTURE.launch,template:'javascript:alert({amount})',allowedSchemes:['javascript']}};
  assert.equal(BRIDGE.buildLaunch(js,{amount:1000,requestKey:'pay_abcdef123',returnUrl:'https://ekodi.kr/x'}),null);
});

test('vendor result parsing maps approve/fail and rejects card-number-like approvals',()=>{
  const ok=BRIDGE.parseResult(FIXTURE,new URLSearchParams('key=pay_abcdef123&rc=0000&apno=A12345&amt=31500'));
  assert.deepEqual({...ok},{requestKey:'pay_abcdef123',status:'approved',approvalNo:'A12345',amount:31500,provider:'kicc_easycheck'});
  assert.equal(BRIDGE.parseResult(FIXTURE,{key:'pay_abcdef123',rc:'9999'}).status,'failed');
  assert.equal(BRIDGE.parseResult(FIXTURE,{key:'pay_abcdef123',rc:'1234'}),null,'unknown codes are never treated as approval');
  assert.equal(BRIDGE.parseResult(FIXTURE,{key:'pay_abcdef123',rc:'0000',apno:'4111111111111111'}),null);
  assert.equal(BRIDGE.parseResult(BRIDGE.adapter('kicc_easycheck'),{key:'pay_abcdef123',rc:'0000'}),null);
});

test('create validation blocks invalid amounts, vendor self-approval and card numbers',()=>{
  const base={amount:15000,requestKey:'pay_abcdef123',orderRef:'platform:baemin:B2310-118'};
  assert.equal(BRIDGE.validateCreate({...base,status:'approved',approvalNo:'A1234'}).ok,true);
  assert.equal(BRIDGE.validateCreate({...base,amount:0}).error,'INVALID_AMOUNT');
  assert.equal(BRIDGE.validateCreate({...base,amount:100000001}).error,'INVALID_AMOUNT');
  assert.equal(BRIDGE.validateCreate({...base,provider:'kicc_easycheck',status:'approved'}).error,'PROVIDER_APPROVAL_REQUIRES_RESULT');
  assert.equal(BRIDGE.validateCreate({...base,approvalNo:'4111111111111111'}).error,'INVALID_APPROVAL_NO');
  assert.equal(BRIDGE.validateCreate({...base,orderRef:'<script>'}).error,'INVALID_ORDER_REF');
  assert.equal(BRIDGE.validateCreate({...base,orderRef:'walk_in'}).ok,true);
  assert.equal(BRIDGE.canTransition('approved','approved'),false);
  assert.equal(BRIDGE.canTransition('failed','approved'),false);
  assert.equal(BRIDGE.canTransition('requested','approved'),true);
});

test('bridge factory is self-contained so the client can receive it as source',()=>{
  const rebuilt=new Function(`return (${createTerminalBridge.toString()})()`)();
  assert.equal(rebuilt.adapterReady(rebuilt.adapter('manual')),true);
  assert.match(rebuilt.newRequestKey(),/^pay_[a-z0-9]+_[0-9a-f]{24}$/);
});

// ---- Runtime against the real migration (SQLite as D1) ----------------------

function d1(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/202610241200_store_terminal_payments.sql',import.meta.url),'utf8'));
  db.exec(`CREATE TABLE messenger_identity_audit(id INTEGER PRIMARY KEY,principal_id TEXT,principal_kind TEXT,auth_provider TEXT,email TEXT,subject_type TEXT,subject_key TEXT,role TEXT,capability TEXT,created_at TEXT)`);
  const stmt=(sql,args=[])=>({
    bind:(...a)=>stmt(sql,a),
    run:async()=>{const r=db.prepare(sql).run(...args);return{meta:{last_row_id:Number(r.lastInsertRowid),changes:Number(r.changes)}}},
    first:async()=>db.prepare(sql).get(...args)??null,
    all:async()=>({results:db.prepare(sql).all(...args)}),
  });
  return{DB:{prepare:sql=>stmt(sql)},raw:db};
}
function mockAuth(role='owner'){
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    const u=String(url);
    if(u.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'u1',email:'owner@example.com',email_confirmed_at:'2026-01-01T00:00:00Z'}),{status:200});
    if(u.includes('store_operating_space_snapshot'))return new Response(JSON.stringify({role,store:{id:'s1',name:'자담치킨 목포대점'}}),{status:200});
    return new Response('{}',{status:404});
  };
  return()=>{globalThis.fetch=original};
}
const env=extra=>({ALLOW_MUTATIONS:'true',ALLOWED_ORIGINS:'https://ekodi.kr',...extra});
const req=(path,{method='GET',body,store='jadam',origin='https://ekodi.kr'}={})=>new Request(`https://w.example${path}${path.includes('?')?'&':'?'}subject_type=tenant&subject_key=${store}`,{method,headers:{authorization:'Bearer t',origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});

test('manual table payment is recorded once, listed for today and summarised per order',async()=>{
  const restore=mockAuth();const e=env(d1());
  try{
    const body={orderRef:'platform:baemin:B2310-118',amount:31500,method:'card_terminal',provider:'manual',status:'approved',requestKey:'pay_abcdef123',approvalNo:'A12345'};
    const r1=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{method:'POST',body}),e);
    assert.equal(r1.status,201);
    const r2=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{method:'POST',body}),e);
    assert.equal(r2.status,200);assert.equal((await r2.json()).idempotent,true);
    const list=await (await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments'),e)).json();
    assert.equal(list.payments.length,1);
    assert.equal(list.summary.total,31500);
    assert.equal(list.summary.byOrder['platform:baemin:B2310-118'],31500);
    assert.equal(list.adapters.find(a=>a.id==='kicc_easycheck').ready,false);
    const cols=e.raw.prepare(`PRAGMA table_info(store_terminal_payments)`).all().map(c=>c.name);
    assert.ok(!cols.some(c=>/card|pan|cvc|expiry/i.test(c)),'no card data columns');
  }finally{restore()}
});

test('payments are isolated per store and require the orders capability',async()=>{
  const e=env(d1());
  let restore=mockAuth();
  try{
    await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{method:'POST',body:{amount:9000,provider:'manual',status:'approved',requestKey:'pay_jadam0001'}}),e);
    const other=await (await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{store:'pizzamaru'}),e)).json();
    assert.equal(other.payments.length,0);
    const unknownStore=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{store:'evilstore'}),e);
    assert.equal(unknownStore.status,403);
  }finally{restore()}
  restore=mockAuth('viewer_without_orders');
  try{
    const denied=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments'),e);
    assert.equal(denied.status,403);
  }finally{restore()}
  const noAuth=await handleStoreTerminalPaymentApi(new Request('https://w.example/v1/store-terminal/payments?subject_type=tenant&subject_key=jadam',{headers:{origin:'https://ekodi.kr'}}),e);
  assert.equal(noAuth.status,401);
  const badOrigin=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{origin:'https://evil.example'}),e);
  assert.equal(badOrigin.status,403);
});

test('writes stop when mutations are disabled and vendor routes stay closed until registered',async()=>{
  const restore=mockAuth();
  try{
    const off=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{method:'POST',body:{amount:1000,provider:'manual',status:'approved',requestKey:'pay_abcdef123'}}),env({...d1(),ALLOW_MUTATIONS:'false'}));
    assert.equal(off.status,503);
    const e=env(d1());
    const vendor=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{method:'POST',body:{amount:1000,provider:'kicc_easycheck',status:'requested',requestKey:'pay_abcdef123'}}),e);
    assert.equal(vendor.status,409);assert.equal((await vendor.json()).error,'ADAPTER_NOT_READY');
    const result=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/results',{method:'POST',body:{provider:'kicc_easycheck',params:{key:'pay_abcdef123',rc:'0000'}}}),e);
    assert.equal(result.status,409);
    const bad=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{method:'POST',body:{amount:-5,provider:'manual',requestKey:'pay_abcdef123'}}),e);
    assert.equal(bad.status,400);
    const noDb=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments'),env({}));
    assert.equal(noDb.status,503);
  }finally{restore()}
});

test('cancel follows the transition table and approval cannot be repeated',async()=>{
  const restore=mockAuth();const e=env(d1());
  try{
    const created=await (await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments',{method:'POST',body:{amount:12000,provider:'manual',status:'approved',requestKey:'pay_cancel0001'}}),e)).json();
    const id=created.payment.id;
    const again=await handleStoreTerminalPaymentApi(req(`/v1/store-terminal/payments/${id}/actions`,{method:'POST',body:{action:'approve',approvalNo:'A9999'}}),e);
    assert.equal(again.status,409);
    const cancel=await handleStoreTerminalPaymentApi(req(`/v1/store-terminal/payments/${id}/actions`,{method:'POST',body:{action:'cancel'}}),e);
    assert.equal(cancel.status,200);assert.equal((await cancel.json()).payment.status,'cancelled');
    const list=await (await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments'),e)).json();
    assert.equal(list.summary.total,0,'cancelled payments leave the total');
    const missing=await handleStoreTerminalPaymentApi(req('/v1/store-terminal/payments/999/actions',{method:'POST',body:{action:'cancel'}}),e);
    assert.equal(missing.status,404);
  }finally{restore()}
});

test('today window is the KST calendar day',()=>{
  assert.equal(kstDayStartIso(Date.parse('2026-10-24T14:59:00Z')),'2026-10-23T15:00:00.000Z');
  assert.equal(kstDayStartIso(Date.parse('2026-10-24T15:00:00Z')),'2026-10-24T15:00:00.000Z');
});
