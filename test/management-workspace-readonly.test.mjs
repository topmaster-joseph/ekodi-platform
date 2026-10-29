import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../management-worker.js';

const base='https://management.ekodi.kr/api/spaces'; // The canonical edge router strips /management before dispatch to this Worker.
const env={INTEGRATIONS_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-publishable'};
const request=(headers={},method='GET')=>new Request(base,{method,headers});

test('spaces endpoint rejects anonymous and non-GET requests without upstream access',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('upstream must not be called')};
  try{
    const unauth=await worker.fetch(request(),env,{});
    assert.equal(unauth.status,401);
    assert.equal((await unauth.json()).error,'unauthorized');
    const post=await worker.fetch(request({authorization:'Bearer valid'},'POST'),env,{});
    assert.equal(post.status,405);
    assert.equal((await post.json()).error,'method_not_allowed');
  }finally{globalThis.fetch=original}
});

test('member workspace projection uses verified Edge Function and returns minimal fields',async()=>{
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,init)=>{
    calls.push({url,init});
    return new Response(JSON.stringify({user:{id:'verified-user',email:'private@example.com'},spaces:[
      {workspace_id:'store-1',slug:'jadam',name:'자담치킨',role:'store_owner',kind:'store',status:'active',internalSecret:'never'},
      {workspace_id:'org-1',slug:'cgma',name:'상인회',role:'tenant_admin',kind:'tenant',status:'active'},
      {workspace_id:'invalid',slug:'',name:'bad',role:'owner'}
    ]}),{headers:{'content-type':'application/json'}});
  };
  try{
    const response=await worker.fetch(request({authorization:'Bearer header.user.signature'}),env,{});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const data=await response.json();
    assert.equal(data.scope,'authenticated-member-only');
    assert.equal(data.spaces.length,2);
    assert.deepEqual(data.spaces.map(x=>x.slug),['jadam','cgma']);
    assert.equal(data.spaces[0].internalSecret,undefined);
    assert.equal(JSON.stringify(data).includes('private@example.com'),false);
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://example.supabase.co/functions/v1/workspace-api/spaces');
    assert.equal(calls[0].init.headers.authorization,'Bearer header.user.signature');
    assert.equal(calls[0].init.method,'GET');
    assert.equal(calls[0].init.redirect,'error');
  }finally{globalThis.fetch=original}
});

test('authorization failures and integration outages fail closed without leaking upstream bodies',async()=>{
  const original=globalThis.fetch;
  try{
    const disabled=await worker.fetch(request({authorization:'Bearer token'}),{...env,INTEGRATIONS_ENABLED:'false'},{});
    assert.equal(disabled.status,503);
    globalThis.fetch=async()=>new Response(JSON.stringify({access_token:'should-not-leak',error:'private'}),{status:403});
    const denied=await worker.fetch(request({authorization:'Bearer token'}),env,{});
    assert.equal(denied.status,403);
    assert.deepEqual(await denied.json(),{error:'workspace_access_denied'});
    globalThis.fetch=async()=>new Response('not-json',{status:200});
    const invalid=await worker.fetch(request({authorization:'Bearer token'}),env,{});
    assert.equal(invalid.status,502);
    assert.deepEqual(await invalid.json(),{error:'invalid_workspace_response'});
  }finally{globalThis.fetch=original}
});
