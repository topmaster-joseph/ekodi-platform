import test from 'node:test';
import assert from 'node:assert/strict';
import {isEkodibizAgencyPath,proxyEkodibizAgency,legacyAgencyAdminRedirect} from '../ekodibiz-agency-route.js';
import {readFile} from 'node:fs/promises';

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

test('exact old AI-agency /admin alias redirects to /manage without forwarding query or private identifiers',()=>{
  const oldUrls=['/ekodibiz/ai-agency/admin','/ekodibiz/ai-agency/admin/'];
  for(const path of oldUrls){
    const url='https://ekodi.kr'+path+'?receiptToken=SYNTHETIC-SECRET&customer=example';
    for(const method of ['GET','HEAD']){
      const response=legacyAgencyAdminRedirect(new Request(url,{method}));
      assert.equal(response.status,308);
      assert.equal(response.headers.get('location'),'https://ekodi.kr/ekodibiz/ai-agency/manage');
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.match(response.headers.get('x-robots-tag'),/noindex/);
      assert.ok(!response.headers.get('location').includes('SYNTHETIC-SECRET'));
    }
    const blocked=legacyAgencyAdminRedirect(new Request(url,{method:'POST'}));
    assert.equal(blocked.status,405);
    assert.equal(blocked.headers.get('allow'),'GET, HEAD');
    assert.equal(blocked.headers.get('location'),null);
  }
  for(const url of [
    'https://other.example/ekodibiz/ai-agency/admin',
    'http://ekodi.kr/ekodibiz/ai-agency/admin',
    'https://ekodi.kr/ekodibiz/another/admin',
    'https://ekodi.kr/ekodibiz/ai-agency/admin/other'
  ])assert.equal(legacyAgencyAdminRedirect(new Request(url)),null);
});
test('site-core and worker apply legacy handoff before generic workspace admin',async()=>{
  const [entry,site,biz]=await Promise.all([
    readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../site-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../ekodibiz-worker.js',import.meta.url),'utf8'),
  ]);
  for(const source of [entry,site]){
    assert.ok(source.includes('legacyAgencyAdminRedirect(request)'),
      'Site-side entry must call the exact legacy redirect');
    assert.ok(source.indexOf('legacyAgencyAdminRedirect(request)') <
      source.indexOf('isWorkspaceAdminPath(url.pathname)'),
    'Agency alias must be resolved before generic workspace admin');
  }
  assert.ok(biz.includes("'/ai-agency/admin':'/ai-agency/manage'"));
  assert.ok(biz.includes("'/ai-agency/admin/':'/ai-agency/manage'"));
  assert.ok(biz.includes("destination.search='';"));
});
