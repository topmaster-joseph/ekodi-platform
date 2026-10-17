import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {isSeasonalPortalPath,seasonalPortalResponse,SEASONAL_PORTAL_ROOT} from '../seasonal-workforce/route.mjs';

const ROOT='https://ekodi.kr'+SEASONAL_PORTAL_ROOT;
const req=(suffix='',options={})=>new Request(ROOT+suffix,options);

test('only the canonical scoped route is owned',()=>{
 assert.equal(isSeasonalPortalPath(SEASONAL_PORTAL_ROOT),true);
 assert.equal(isSeasonalPortalPath(SEASONAL_PORTAL_ROOT+'/survey-demo'),true);
 assert.equal(isSeasonalPortalPath('/ekodibiz/seasonal-workers-malicious'),false);
 assert.equal(seasonalPortalResponse(new Request('https://ekodi.kr/ekodibiz/other')),null);
});
test('canonical root redirects without changing site or query',()=>{
 const result=seasonalPortalResponse(req('?source=proposal'));
 assert.equal(result.status,308);
 assert.equal(result.headers.get('location'),SEASONAL_PORTAL_ROOT+'/?source=proposal');
});
test('public root is a noindex, no-store demonstration',async()=>{
 const response=seasonalPortalResponse(req('/'));
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/text\/html/);
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
 assert.match(response.headers.get('x-robots-tag'),/noindex/);
 const body=await response.text();
 assert.match(body,/계절근로자/);
 assert.match(body,/실제 농가 신청이나 근로자 개인정보 접수는 하지 않습니다/);
 assert.match(body,/href="\/ekodibiz\/seasonal-workers\/demand"/);
 assert.doesNotMatch(body,/<script(?:\s|>)[^>]*>[^<]+<\/script>/);
});
test('survey page loads same-origin script rather than inline JavaScript',async()=>{
 const response=seasonalPortalResponse(req('/survey-demo'));
 assert.equal(response.status,200);
 const body=await response.text();
 assert.match(body,/src="\.\/survey-demo\.js"/);
 assert.doesNotMatch(body,/<script>/);
 assert.match(body,/서버로 전송되지 않으며 저장되지 않습니다/);
});
test('survey script only renders local demonstration data',async()=>{
 const response=seasonalPortalResponse(req('/survey-demo.js'));
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/javascript/);
 const body=await response.text();
 assert.match(body,/addEventListener\('submit'/);
 assert.doesNotMatch(body,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
});
test('all application API requests fail closed for every HTTP method',async()=>{
 for(const method of ['GET','POST','PATCH','DELETE']){
  const response=seasonalPortalResponse(req('/api/v1/demands',{method}));
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{ok:false,error:'applications_not_enabled'});
 }
});
test('head, cross origin and unsupported methods are safe',async()=>{
 const head=seasonalPortalResponse(req('/survey-demo',{method:'HEAD'}));
 assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal(seasonalPortalResponse(req('/survey-demo',{method:'POST'})).status,405);
 assert.equal(seasonalPortalResponse(new Request('https://evil.example/ekodibiz/seasonal-workers/')).status,403);
 assert.equal(seasonalPortalResponse(req('/not-found')).status,404);
});
test('registered in canonical platform router before EKODIBIZ generic delegation',()=>{
 const source=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
 assert.match(source,/from '\.\/seasonal-workforce\/route\.mjs'/);
 const seasonal=source.indexOf('if(isSeasonalPortalPath(url.pathname))return seasonalPortalResponse(request)');
 const generic=source.indexOf('if(url.pathname.startsWith(EKODIBIZ_API_PREFIX))');
 assert.ok(seasonal>0 && seasonal<generic);
});
