import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStorageGateway} from '../storage-gateway.js';

const api='https://ekodi.kr/api/storage/v1';
const key='unit-test-gateway-key';

function gatewayEnv() {
  let calls=0,last=null;
  return {
    env:{
      EKODI_STORAGE_GATEWAY_KEY:key,
      STORAGE:{async fetch(request){calls+=1;last=request;
        return new Response(JSON.stringify({ok:true,origin:'private-storage-binding'}),{
          status:200,headers:{'content-type':'application/json'}});}},
    },
    count:()=>calls,
    last:()=>last,
  };
}

test('public no-credential gateway cannot proxy privileged read/write routes',async()=>{
  const g=gatewayEnv();
  const routes=[
    ['GET','/policy'],['GET','/files/opaque-private-id'],['GET','/file-provenance/opaque-private-id'],
    ['POST','/records'],['POST','/archive-r2'],['POST','/delete-file']
  ];
  for(const [method,path] of routes){
    const response=await handleStorageGateway(new Request(api+path,{method}),g.env);
    assert.equal(response.status,401,method+' '+path);
    assert.equal((await response.json()).code,'STORAGE_UNAUTHORIZED');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(g.count(),0,'no unauthorized request may reach privileged service binding');
});

test('arbitrary auth headers or an empty service key cannot substitute for shared secret',async()=>{
  const g=gatewayEnv();
  for(const supplied of ['wrong-value','',undefined]){
    const headers={'authorization':'Bearer untrusted-browser-token'};
    if(supplied!==undefined)headers['x-ekodi-storage-key']=supplied;
    const response=await handleStorageGateway(new Request(api+'/files/opaque-private-id',{headers}),g.env);
    assert.equal(response.status,401);
  }
  assert.equal(g.count(),0);
  const deny=await handleStorageGateway(new Request(api+'/files/opaque-private-id',
    {headers:{'x-ekodi-storage-key':key}}),{...g.env,EKODI_STORAGE_GATEWAY_KEY:''});
  assert.equal(deny.status,401);
  assert.equal(g.count(),0);
});

test('signed server-to-server proxy still works with same identity and path',async()=>{
  const g=gatewayEnv();
  const url=api+'/files/opaque-private-id?download=1';
  const response=await handleStorageGateway(new Request(url,{
    headers:{'x-ekodi-storage-key':key}}),g.env);
  assert.equal(response.status,200);
  assert.equal(g.count(),1);
  assert.equal(new URL(g.last().url).hostname,'storage.internal');
  assert.equal(new URL(g.last().url).pathname,'/api/storage/v1/files/opaque-private-id');
  assert.equal(g.last().headers.get('x-ekodi-storage-key'),key);
});
test('public health stays available while private-looking Host cannot bypass proxy authorization',async()=>{
  const g=gatewayEnv();
  const h=await handleStorageGateway(new Request(api+'/health'),g.env);
  assert.equal(h.status,200);
  const internal=await handleStorageGateway(new Request(
    'https://storage.internal/api/storage/v1/files/internal-only-test'),g.env);
  assert.equal(internal.status,401);
  assert.equal((await internal.json()).code,'STORAGE_UNAUTHORIZED');
  assert.equal(g.count(),1);
});
