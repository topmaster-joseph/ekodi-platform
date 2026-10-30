import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../management-worker.js';

const base='https://ekodi.kr/api/store-summary';
const env={INTEGRATIONS_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-publishable'};
const request=(suffix='',headers={},method='GET')=>new Request(base+suffix,{method,headers});
const bearer={authorization:'Bearer token.signature'};

test('unauthenticated, invalid slug and any write method are denied before upstream',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('must not call upstream')};
  try{
    const unauthorized=await worker.fetch(request('?slug=jadam'),env,{});
    assert.equal(unauthorized.status,401);
    assert.equal((await unauthorized.json()).error,'unauthorized');
    const malformed=await worker.fetch(request('?slug=..%2Fadmin',bearer),env,{});
    assert.equal(malformed.status,400);
    const post=await worker.fetch(request('?slug=jadam',bearer,'POST'),env,{});
    assert.equal(post.status,405);
  }finally{globalThis.fetch=previous}
});

test('verified RLS store snapshot is reduced to safe aggregate read model',async()=>{
  const previous=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,init)=>{
    calls.push({url,init});
    return new Response(JSON.stringify({workspace:{
      workspace_id:'store-id-1',slug:'jadam',name:'자담치킨',kind:'store',role:'store_owner',
      store:{order_enabled:true,phone:'private-number',address:'private-address'},
      summary:{canonical_menu_count:12,platform_listing_count:35,connected_channel_count:3},
      channels:[{provider:'delivery',privateKey:'private'}],menu:[{id:'menu1',base_price:5000}]
    },authorization:'store_members+RLS'}),{headers:{'content-type':'application/json'}});
  };
  try{
    const result=await worker.fetch(request('?slug=jadam',bearer),env,{});
    assert.equal(result.status,200);
    assert.equal(result.headers.get('cache-control'),'no-store');
    const body=await result.json();
    assert.equal(body.workspace.slug,'jadam');
    assert.deepEqual(body.summary,{canonicalMenuCount:12,platformListingCount:35,connectedChannelCount:3,orderEnabled:true});
    assert.equal(body.workspace.role,'store_owner');
    assert.equal(JSON.stringify(body).includes('private-number'),false);
    assert.equal(JSON.stringify(body).includes('privateKey'),false);
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://example.supabase.co/functions/v1/workspace-api/spaces/store-dashboard?slug=jadam');
    assert.equal(calls[0].init.headers.authorization,'Bearer token.signature');
    assert.equal(calls[0].init.method,'GET');
    assert.equal(calls[0].init.redirect,'error');
  }finally{globalThis.fetch=previous}
});

test('missing membership, disabled provider, malformed responses fail closed',async()=>{
  const previous=globalThis.fetch;
  try{
    const disabled=await worker.fetch(request('?slug=jadam',bearer),{...env,INTEGRATIONS_ENABLED:'false'},{});
    assert.equal(disabled.status,503);
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'private-details'}),{status:403});
    const forbidden=await worker.fetch(request('?slug=jadam',bearer),env,{});
    assert.equal(forbidden.status,403);
    assert.equal(JSON.stringify(await forbidden.json()).includes('private-details'),false);
    globalThis.fetch=async()=>new Response(JSON.stringify({workspace:{workspace_id:'x',slug:'other',kind:'store'}}),{status:200});
    const wrong=await worker.fetch(request('?slug=jadam',bearer),env,{});
    assert.equal(wrong.status,502);
    assert.equal((await wrong.json()).error,'invalid_store_response');
  }finally{globalThis.fetch=previous}
});

test('malformed or missing upstream metrics never silently become invented zeros',async()=>{
  const previous=globalThis.fetch;
  const good={workspace_id:'s1',slug:'jadam',kind:'store',name:'매장',
    store:{order_enabled:true},
    summary:{canonical_menu_count:0,platform_listing_count:0,connected_channel_count:0}};
  try{
    for(const patch of [
      {summary:{canonical_menu_count:null,platform_listing_count:0,connected_channel_count:0}},
      {summary:{canonical_menu_count:'0',platform_listing_count:0,connected_channel_count:0}},
      {summary:{canonical_menu_count:-1,platform_listing_count:0,connected_channel_count:0}},
      {summary:{canonical_menu_count:0,platform_listing_count:3.5,connected_channel_count:0}},
      {summary:{canonical_menu_count:0,platform_listing_count:0}},
      {store:{order_enabled:null}}
    ]){
      const response={workspace:{...good,...patch}};
      globalThis.fetch=async()=>new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
      const result=await worker.fetch(request('?slug=jadam',bearer),env,{});
      assert.equal(result.status,502,JSON.stringify(patch));
      assert.deepEqual(await result.json(),{error:'invalid_store_metrics'});
    }
    globalThis.fetch=async()=>new Response(JSON.stringify({workspace:good}),{status:200,headers:{'content-type':'application/json'}});
    const valid=await worker.fetch(request('?slug=jadam',bearer),env,{});
    assert.equal(valid.status,200,'genuine zero metrics must remain valid');
    const body=await valid.json();
    assert.equal(body.summary.canonicalMenuCount,0);
    assert.equal(body.summary.orderEnabled,true);
  }finally{globalThis.fetch=previous}
});
