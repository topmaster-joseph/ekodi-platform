import test from 'node:test';
import assert from 'node:assert/strict';
import {isEkodibizAgencyPath,proxyEkodibizAgency} from '../ekodibiz-agency-route.js';

test('canonical agency routes are narrowly scoped',()=>{
  for(const path of ['/ekodibiz/ai-agency','/ekodibiz/ai-agency/','/ekodibiz/ai-agency.js','/ekodibiz/ai-agency-admin',
    '/ekodibiz/ai-agency-admin/','/ekodibiz/ai-agency-admin.js','/ekodibiz/ai-agency/manage',
    '/ekodibiz/ai-agency/manage/','/ekodibiz/api/agency/apply',
    '/ekodibiz/api/agency/admin/quote','/ekodibiz/api/agency/health']){
    assert.equal(isEkodibizAgencyPath(path),true,path);
  }
  for(const path of ['/ekodibiz','/ekodibiz/ai-agency-dangerous','/ekodibiz/pay','/ekodibiz/api/checkout-intent',
    '/ekodibiz/api/agency/../../admin','/ekodibiz/api/agency','/ekodimall/ai-agency']){
    assert.equal(isEkodibizAgencyPath(path),false,path);
  }
});
test('canonical proxy forwards original request, method, body and dedicated CSP',async()=>{
  const original=new Request('https://ekodi.kr/ekodibiz/api/agency/apply',{method:'POST',
    headers:{origin:'https://ekodi.kr','content-type':'application/json'},
    body:JSON.stringify({marker:'owned-by-ekodibiz'})});
  let forwarded=null;
  const proxy=await proxyEkodibizAgency(original,{EKODIBIZ:{fetch:async request=>{
    forwarded=request;
    return new Response(JSON.stringify({ok:true}),{status:201,headers:{
      'content-type':'application/json','content-security-policy':"default-src 'self'; frame-ancestors 'none'"
    }});
  }}});
  assert.equal(proxy.status,201);
  assert.equal(forwarded.url,original.url);
  assert.equal(forwarded.method,'POST');
  assert.equal(await forwarded.json().then(x=>x.marker),'owned-by-ekodibiz');
  assert.equal(proxy.headers.get('content-security-policy'),"default-src 'self'; frame-ancestors 'none'");
  assert.equal(proxy.headers.get('x-ekodi-canonical-service'),'ekodibiz-agency');
});
test('canonical proxy fails closed without a bound service and rejects other hosts',async()=>{
  const missing=await proxyEkodibizAgency(new Request('https://ekodi.kr/ekodibiz/ai-agency'),{});
  assert.equal(missing.status,503);
  const denied=await proxyEkodibizAgency(new Request('https://example.org/ekodibiz/ai-agency'),{
    EKODIBIZ:{fetch:()=>{throw Error('should not route');}}
  });
  assert.equal(denied.status,404);
});
