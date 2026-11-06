import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../management-worker.js';

const url='https://ekodi.kr/api/store-business-summary';
const env={INTEGRATIONS_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable-test'};
const authorized={authorization:'Bearer member-token.signature'};
const request=(suffix='?slug=jadam',headers=authorized,method='GET')=>new Request(url+suffix,{headers,method});
const scope=(role='store_owner',id='store-1')=>({space:{
  workspace_id:id,slug:'jadam',name:'매장',kind:'store',status:'active',role
}});
const sample={
  workspace:{key:'jadam',storeId:'store-1',tenantId:'tenant-private'},
  asOf:'2026-11-07T00:00:00.000Z',
  orders:{count:5,averageTicket:20000,channels:{privateRef:'SECRET'}},
  metrics:{sales:100000,customers:3,newCustomers:1,repeatRate:33.3,customerPhone:'private'},
  finance:{connected:true,cashIn:130000,cashOut:50000,costTotal:45000,metadata:{bank:'private'}},
  marketing:{unansweredReviews:2},privateCustomerDetails:[{phone:'private-number'}]
};
function mockUpstream({role='store_owner',id='store-1',model=sample,scopeStatus=200,rpcStatus=200}={}){
  const calls=[],before=globalThis.fetch;
  globalThis.fetch=async(target,init={})=>{
    calls.push({target:String(target),init});
    if(String(target).includes('/spaces/resolve?'))return new Response(
      JSON.stringify(scopeStatus===200?scope(role,id):{error:'sensitive denied'}),{status:scopeStatus});
    if(String(target).endsWith('/rest/v1/rpc/business_os_store_admin_snapshot'))return new Response(
      JSON.stringify(rpcStatus===200?model:{error:'private upstream failure'}),{status:rpcStatus});
    throw Error('unanticipated upstream: '+target);
  };
  return{calls,restore(){globalThis.fetch=before}};
}

test('anonymous, malformed slug and write methods fail before any upstream call',async()=>{
  const before=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('upstream forbidden')};
  try{
    const guest=await worker.fetch(request('?slug=jadam',{},'GET'),env,{});
    assert.equal(guest.status,401);
    const bogus=await worker.fetch(request('?slug=..%2Fadmin'),env,{});
    assert.equal(bogus.status,400);
    const write=await worker.fetch(request('?slug=jadam',authorized,'POST'),env,{});
    assert.equal(write.status,405);
  }finally{globalThis.fetch=before}
});

test('RLS store-owner scope and SQL-authorized aggregate return only whitelisted business numbers',async()=>{
  const up=mockUpstream();
  try{
    const res=await worker.fetch(request(),env,{});
    assert.equal(res.status,200);
    assert.equal(res.headers.get('cache-control'),'no-store');
    const body=await res.json();
    assert.equal(body.dataPolicy,'verified-business-aggregate-read-only');
    assert.equal(body.workspace.id,'store-1');
    assert.equal(body.coverage,'ekodi-recorded-completed-orders-only');
    assert.deepEqual(body.orders,{completedCount:5,averageTicket:20000});
    assert.deepEqual(body.sales,{recordedCompletedSales:100000});
    assert.deepEqual(body.customers,{identifiedToday:3,newFromBaseOrders:1});
    assert.deepEqual(body.settlement,{status:'internal-aggregate',cashIn:130000,cashOut:50000,costTotal:45000});
    const serial=JSON.stringify(body);
    for(const forbidden of ['SECRET','private','customerPhone','phone','metadata','tenantId','repeatRate'])
      assert.equal(serial.includes(forbidden),false,forbidden);
    assert.equal(up.calls.length,2);
    assert.equal(up.calls[0].init.method,'GET');
    assert.match(up.calls[0].target,/workspace-api\/spaces\/resolve\?slug=jadam/);
    assert.equal(up.calls[0].init.headers.authorization,'Bearer member-token.signature');
    assert.equal(up.calls[1].init.method,'POST');
    assert.equal(up.calls[1].init.redirect,'error');
    assert.equal(up.calls[1].init.headers.authorization,'Bearer member-token.signature');
    assert.equal(up.calls[1].init.headers.apikey,'publishable-test');
    assert.deepEqual(JSON.parse(up.calls[1].init.body),{p_workspace_key:'jadam'});
  }finally{up.restore()}
});

test('store staff cannot read sensitive financial aggregates even with store member RLS',async()=>{
  for(const role of ['store_staff','member','guest']){
    const up=mockUpstream({role});
    try{
      const res=await worker.fetch(request(),env,{});
      assert.equal(res.status,403);
      assert.deepEqual(await res.json(),{error:'business_aggregate_role_required'});
      assert.equal(up.calls.length,1,'never send restricted RPC');
    }finally{up.restore()}
  }
});

test('RLS permission failure and spoofed store identity fail closed, without upstream information',async()=>{
  for(const status of [401,403,404]){
    const up=mockUpstream({scopeStatus:status});
    try{
      const res=await worker.fetch(request(),env,{});
      assert.equal(res.status,status);
      assert.equal(JSON.stringify(await res.json()).includes('sensitive denied'),false);
      assert.equal(up.calls.length,1);
    }finally{up.restore()}
  }
  const mismatched=mockUpstream({id:'wrong-store'});
  try{
    const res=await worker.fetch(request(),env,{});
    assert.equal(res.status,502);
    assert.equal((await res.json()).error,'invalid_business_aggregate');
  }finally{mismatched.restore()}
  const mismatchedKey=mockUpstream({model:{...sample,workspace:{key:'another',storeId:'store-1'}}});
  try{
    const res=await worker.fetch(request(),env,{});
    assert.equal(res.status,502);
  }finally{mismatchedKey.restore()}
});

test('missing or fabricated counts and finance amounts cannot silently become zero',async()=>{
  for(const model of [
    {...sample,orders:{count:null,averageTicket:20000}},
    {...sample,orders:{count:'0',averageTicket:20000}},
    {...sample,metrics:{...sample.metrics,sales:null}},
    {...sample,metrics:{...sample.metrics,customers:6}},
    {...sample,finance:{...sample.finance,cashIn:-1}},
    {...sample,asOf:'unparseable timestamp'}
  ]){
    const up=mockUpstream({model});
    try{
      const res=await worker.fetch(request(),env,{});
      assert.equal(res.status,502);
      assert.deepEqual(await res.json(),{error:'invalid_business_aggregate'});
    }finally{up.restore()}
  }
});

test('a truly disconnected internal-finance source is displayed as unconnected, not zero',async()=>{
  const up=mockUpstream({model:{...sample,finance:{connected:false,cashIn:null,cashOut:null,costTotal:null}}});
  try{
    const res=await worker.fetch(request(),env,{});
    assert.equal(res.status,200);
    const body=await res.json();
    assert.deepEqual(body.settlement,{status:'not-connected'});
    assert.equal(JSON.stringify(body).includes('cashIn'),false);
  }finally{up.restore()}
});

test('upstream business authorization or outage never falls back to other store, fake data or partial details',async()=>{
  for(const status of [401,403,404,500]){
    const up=mockUpstream({rpcStatus:status});
    try{
      const res=await worker.fetch(request(),env,{});
      assert.equal(res.status,[401,403,404].includes(status)?403:503);
      const body=await res.json();
      assert.equal(JSON.stringify(body).includes('private upstream failure'),false);
    }finally{up.restore()}
  }
});
