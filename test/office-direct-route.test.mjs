import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import siteWorker from '../site-worker.js';
import {isReservedPlatformRoot,platformExecutionSurfaceForPath} from '../platform-route-registry.js';

const origin='https://ekodi.kr';
const site=(path,method='GET',assetLog=[])=>siteWorker.fetch(
  new Request(origin+path,{method}),{
    ASSETS:{async fetch(request){
      const p=new URL(request.url).pathname;
      assetLog.push(p);
      if(!['/office/','/office/index.html','/office/office.css','/office/office.js'].includes(p))return new Response('Unknown',{status:404});
      return new Response(p,{status:200,headers:{'content-type':'text/plain'}});
    }}
  }
);

test('office is reserved as one platform capability but not a new worker or workspace',()=>{
  assert.equal(isReservedPlatformRoot('office'),true);
  assert.equal(platformExecutionSurfaceForPath('/office'),null);
});
test('both canonical spellings serve the same page directly without any HTTP redirect',async()=>{
  for(const path of ['/office','/office/','/office/index.html']){
    const seen=[];
    const response=await site(path,'GET',seen);
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('location'),null,path);
    assert.deepEqual(seen,[path==='/office'?'/office/':path]);
    assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-ekodi-route'),'office-static-hub');
    assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
    const csp=response.headers.get('content-security-policy')||'';
    for(const directive of ["default-src 'none'","script-src 'self'","style-src 'self'","connect-src 'none'","form-action 'none'","frame-ancestors 'none'"]){
      assert.ok(csp.includes(directive),directive);
    }
    assert.doesNotMatch(csp,/unsafe-inline|https:\/\/|blob:|data:.*script/);
  }
});
test('exact asset allowlist preserves MIME under nosniff and refuses unknown files',async()=>{
  for(const [path,mime] of [
    ['/office/office.css','text/css; charset=utf-8'],
    ['/office/office.js','text/javascript; charset=utf-8']
  ]){
    const response=await site(path);
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('content-type'),mime);
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
  for(const path of ['/office/evil.js','/office/manifest.json','/office/private','/office//','/office/../admin','/office/.env']){
    if(path==='/office/../admin')continue; // URL normalization occurs before the worker sees it.
    const seen=[];
    const response=await site(path,'GET',seen);
    assert.equal(response.status,404,path);
    assert.equal(seen.length,0,'no asset fetch for '+path);
    assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  }
});
test('mutating methods and preflight requests fail closed before asset fetch',async()=>{
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
    const seen=[];
    const response=await site('/office/',method,seen);
    assert.equal(response.status,405,method);
    assert.equal(response.headers.get('allow'),'GET, HEAD');
    assert.equal(seen.length,0,method);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const head=await site('/office','HEAD');
  assert.equal(head.status,200);
});
test('assets-first static security policy has exact route overrides',()=>{
  const headers=readFileSync(new URL('../_headers',import.meta.url),'utf8');
  for(const p of ['/office','/office/','/office/*']){
    const section=headers.split('\n'+p+'\n')[1]?.split('\n\n')[0];
    assert.ok(section,'missing _headers '+p);
    assert.match(section,/script-src 'self'/);
    assert.match(section,/connect-src 'none'/);
    assert.match(section,/form-action 'none'/);
    assert.match(section,/Cache-Control: no-store/);
    assert.match(section,/X-Robots-Tag: noindex/);
  }
});
test('single prototype source is built to office path with fixed base for slashless URL',()=>{
  const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  const prototype=readFileSync(new URL('../office-prototype/index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../office-prototype/office.js',import.meta.url),'utf8');
  assert.match(build,/officeHubIndex\.replace\('<head>','<head><base href="\/office\/">'\)/);
  assert.match(build,/office-prototype\/office\.css/);
  assert.match(build,/office-prototype\/office\.js/);
  assert.match(prototype,/href="\.\/office\.css"/);
  assert.match(prototype,/src="\.\/office\.js"/);
  assert.match(prototype,/실제 파일을 열거나 저장하지 않습니다/);
  for(const route of ['/my/docs/','/proposal/','/edu/'])assert.ok(prototype.includes('https://ekodi.kr'+route));
  assert.doesNotMatch(js,/\bfetch\b|localStorage|sessionStorage|document\.cookie|innerHTML/);
});
