import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlatformSecurityHeaders, enforcePlatformRequestSecurity, PLATFORM_SECURITY_CONSTANTS } from '../platform-security-policy.js';

const limiter=success=>({limit:async()=>({success})});

test('platform security blocks dangerous methods before routing',async()=>{
  const response=await enforcePlatformRequestSecurity({method:'TRACE',url:'https://ekodi.kr/',headers:new Headers()},{});
  assert.equal(response.status,405);
  assert.equal((await response.json()).code,'PLATFORM_METHOD_BLOCKED');
});

test('sensitive writes fail closed if the platform limiter is unavailable',async()=>{
  const request=new Request('https://ekodi.kr/admin/api/control',{method:'POST',body:'{}'});
  const response=await enforcePlatformRequestSecurity(request,{ENVIRONMENT:'production'});
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'PLATFORM_SECURITY_UNAVAILABLE');
});

test('sensitive writes are rate limited at the shared edge',async()=>{
  const request=new Request('https://ekodi.kr/api/control/check',{method:'POST',headers:{'cf-connecting-ip':'203.0.113.9'},body:'{}'});
  const response=await enforcePlatformRequestSecurity(request,{ENVIRONMENT:'production',PLATFORM_SENSITIVE_RATE_LIMITER:limiter(false)});
  assert.equal(response.status,429);
  assert.equal((await response.json()).code,'PLATFORM_SENSITIVE_RATE_LIMITED');
});

test('public writes use a separate limiter',async()=>{
  const request=new Request('https://ekodi.kr/mail/contact',{method:'POST',headers:{'cf-connecting-ip':'203.0.113.10'},body:'{}'});
  const response=await enforcePlatformRequestSecurity(request,{ENVIRONMENT:'production',PLATFORM_PUBLIC_WRITE_RATE_LIMITER:limiter(false)});
  assert.equal(response.status,429);
  assert.equal((await response.json()).code,'PLATFORM_PUBLIC_WRITE_RATE_LIMITED');
});

test('oversized regular mutations are blocked while media gets the larger ceiling',async()=>{
  const oversized=new Request('https://ekodi.kr/feedback',{method:'POST',headers:{'content-length':String(PLATFORM_SECURITY_CONSTANTS.STANDARD_BODY_LIMIT+1)}});
  assert.equal((await enforcePlatformRequestSecurity(oversized,{ENVIRONMENT:'test'})).status,413);
  const media=new Request('https://ekodi.kr/live/recordings/upload',{method:'POST',headers:{'content-length':String(PLATFORM_SECURITY_CONSTANTS.STANDARD_BODY_LIMIT+1)}});
  const response=await enforcePlatformRequestSecurity(media,{ENVIRONMENT:'test',PLATFORM_PUBLIC_WRITE_RATE_LIMITER:limiter(true)});
  assert.equal(response,null);
});

test('shared edge adds security headers without disabling live capture',()=>{
  const request=new Request('https://ekodi.kr/live/session');
  const response=applyPlatformSecurityHeaders(new Response('<html></html>',{headers:{'content-type':'text/html'}}),request);
  assert.match(response.headers.get('strict-transport-security')||'',/includeSubDomains/);
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.match(response.headers.get('permissions-policy')||'',/camera=\(self\)/);
  assert.equal(response.headers.get('x-ekodi-security-policy'),'platform-edge-v2');
});

test('admin and API documents are no-store and non-indexable',()=>{
  const request=new Request('https://ekodi.kr/admin/');
  const response=applyPlatformSecurityHeaders(new Response('<html></html>',{headers:{'content-type':'text/html'}}),request);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
  assert.equal(response.headers.get('cross-origin-opener-policy'),'same-origin-allow-popups');
});
