import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {municipalOfficeHtml,municipalOfficeScript} from '../seasonal-workforce/office-surface.mjs';
import {seasonalPortalResponse} from '../seasonal-workforce/route.mjs';

const origin='https://ekodi.kr/ekodibiz/seasonal-workers/';
test('office is first-party, noindex and no-store',async()=>{
 const response=seasonalPortalResponse(new Request(origin+'office'));
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
 assert.match(response.headers.get('x-robots-tag'),/noindex/);
 assert.match(response.headers.get('cache-control'),/no-store/);
 const body=await response.text();
 assert.match(body,/기관별 운영공간/);
 assert.match(body,/src="\/ekodibiz\/seasonal-workers\/office\.js"/);
 assert.doesNotMatch(body,/<script>/);
});
test('office client syntax compiles and retains draft across canonical login',()=>{
 assert.doesNotThrow(()=>new Script(municipalOfficeScript));
 assert.match(municipalOfficeScript,/return_to/);
 assert.match(municipalOfficeScript,/encodeURIComponent\(location\.href\)/);
 assert.match(municipalOfficeScript,/sessionStorage/);
 assert.match(municipalOfficeScript,/crypto\.randomUUID/);
 assert.doesNotMatch(municipalOfficeScript,/My EKODI|\/my\/dashboard|accounts\.google\.com/);
});
test('office has no worker registration, identity document intake or payment controls',()=>{
 for(const forbidden of ['passport','여권번호','비자발급','계좌번호','수수료 납부'])
  assert.equal(municipalOfficeHtml.includes(forbidden),false);
 assert.match(municipalOfficeHtml,/공식 인력 배정/);
 assert.match(municipalOfficeHtml,/id="office-data" hidden/);
});
test('office JavaScript only fetches same-origin scoped demand API',async()=>{
 const response=seasonalPortalResponse(new Request(origin+'office.js'));
 assert.equal(response.status,200);
 const body=await response.text();
 assert.equal(body,municipalOfficeScript);
 assert.match(body,/ROOT='\/ekodibiz\/seasonal-workers\/api\/v1\/tenants\/'/);
 assert.match(body,/credentials:'omit'/);
 assert.doesNotMatch(body,/https?:\/\/|sendBeacon|XMLHttpRequest|WebSocket|indexedDB/);
});
test('public simulation never receives the more permissive office connect-src',()=>{
 assert.match(seasonalPortalResponse(new Request(origin+'survey-demo')).headers.get('content-security-policy'),/connect-src 'none'/);
 assert.match(seasonalPortalResponse(new Request(origin+'office')).headers.get('content-security-policy'),/connect-src 'self'/);
});
