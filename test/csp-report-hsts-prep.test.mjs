import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyCspReportOnly, CSP_REPORT_ONLY_POLICY, CSP_REPORT_PATH, handleCspReport, isCspReportPath, summarizeCspReports,
} from '../csp-report-policy.js';
import { applyPlatformSecurityHeaders, HSTS_PRELOAD_ENABLED, STRICT_TRANSPORT_SECURITY } from '../platform-security-policy.js';

const html=(headers={})=>new Response('<html></html>',{headers:{'content-type':'text/html; charset=utf-8',...headers}});
const get=path=>new Request('https://ekodi.kr'+path);
const always=()=>0,never=()=>0.99;

test('report-only CSP is added to sampled HTML without an enforcing policy',()=>{
  const out=applyCspReportOnly(html(),get('/ekodichurch'),{},always);
  assert.equal(out.headers.get('content-security-policy-report-only'),CSP_REPORT_ONLY_POLICY);
  assert.doesNotMatch(CSP_REPORT_ONLY_POLICY,/report-to/,'report-to would make Chrome ignore report-uri');
  assert.equal(out.headers.get('content-security-policy'),null,'never enforces');
});

test('report-only CSP never touches pages that already enforce a policy, non-HTML or unsampled views',()=>{
  assert.equal(applyCspReportOnly(html({'content-security-policy':"default-src 'self'"}),get('/admin'),{},always).headers.get('content-security-policy-report-only'),null);
  assert.equal(applyCspReportOnly(new Response('{}',{headers:{'content-type':'application/json'}}),get('/api/x'),{},always).headers.get('content-security-policy-report-only'),null);
  assert.equal(applyCspReportOnly(html(),get('/'),{},never).headers.get('content-security-policy-report-only'),null);
  assert.equal(applyCspReportOnly(html(),get('/'),{EKODI_CSP_REPORT_SAMPLE:'0'},always).headers.get('content-security-policy-report-only'),null);
  assert.equal(applyCspReportOnly(new Response(null,{status:302,headers:{'content-type':'text/html',location:'/x'}}),get('/'),{},always).headers.get('content-security-policy-report-only'),null);
});

test('baseline targets the high-value directives',()=>{
  for(const directive of ["object-src 'none'","base-uri 'self'","frame-ancestors 'self'",`report-uri ${CSP_REPORT_PATH}`])
    assert.ok(CSP_REPORT_ONLY_POLICY.includes(directive),directive);
  assert.doesNotMatch(CSP_REPORT_ONLY_POLICY,/http:(?!\/)|\*/,'no plain-http or wildcard sources');
});

test('collector accepts both report formats, logs privacy-safe fields, answers 204',async()=>{
  const logged=[];const warn=console.warn;console.warn=(...a)=>logged.push(a);
  try{
    const legacy=await handleCspReport(new Request('https://ekodi.kr'+CSP_REPORT_PATH,{method:'POST',headers:{'content-type':'application/csp-report'},body:JSON.stringify({'csp-report':{'document-uri':'https://ekodi.kr/ekodichurch?token=secret','violated-directive':'script-src-elem','blocked-uri':'http://cdn.example.com/a.js?key=1'}})}));
    assert.equal(legacy.status,204);
    const modern=await handleCspReport(new Request('https://ekodi.kr'+CSP_REPORT_PATH,{method:'POST',headers:{'content-type':'application/reports+json'},body:JSON.stringify([{type:'csp-violation',url:'https://ekodi.kr/books',body:{documentURL:'https://ekodi.kr/books',effectiveDirective:'img-src',blockedURL:'http://img.example.com/x.png',disposition:'report'}}])}));
    assert.equal(modern.status,204);
  }finally{console.warn=warn;}
  assert.deepEqual(logged.map(a=>a[1]),[
    {directive:'script-src-elem',blocked:'http://cdn.example.com',page:'/ekodichurch',disposition:'report'},
    {directive:'img-src',blocked:'http://img.example.com',page:'/books',disposition:'report'},
  ]);
  assert.doesNotMatch(JSON.stringify(logged),/secret|key=1/,'query strings never logged');
  assert.equal((await handleCspReport(new Request('https://ekodi.kr'+CSP_REPORT_PATH))).status,405);
  assert.equal((await handleCspReport(new Request('https://ekodi.kr'+CSP_REPORT_PATH,{method:'POST',headers:{'content-type':'text/html'},body:'<x>'}))).status,415);
  assert.equal((await handleCspReport(new Request('https://ekodi.kr'+CSP_REPORT_PATH,{method:'POST',headers:{'content-type':'application/csp-report','content-length':'999999'},body:'{}'}))).status,413);
  assert.equal((await handleCspReport(new Request('https://ekodi.kr'+CSP_REPORT_PATH,{method:'POST',headers:{'content-type':'application/csp-report'},body:'not json'}))).status,204);
  assert.equal(isCspReportPath('/__ekodi/csp-report'),true);
  assert.deepEqual(summarizeCspReports({foo:1}),[]);
});

test('HSTS preload is prepared but NOT announced (owner decision: 준비까지만)',()=>{
  assert.equal(HSTS_PRELOAD_ENABLED,false);
  assert.equal(STRICT_TRANSPORT_SECURITY,'max-age=31536000; includeSubDomains');
  const out=applyPlatformSecurityHeaders(html(),get('/'));
  assert.equal(out.headers.get('strict-transport-security'),'max-age=31536000; includeSubDomains');
  assert.doesNotMatch(out.headers.get('strict-transport-security'),/preload/);
});

test('router wires the collector early and report-only into finalize',async()=>{
  const router=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(router,/isCspReportPath\(new URL\(request\.url\)\.pathname\)\)return applyPlatformSecurityHeaders\(await handleCspReport\(request\),request\)/);
  assert.match(router,/applyPlatformSecurityHeaders\(applyCspReportOnly\(response,request,env\),request\)/);
});
