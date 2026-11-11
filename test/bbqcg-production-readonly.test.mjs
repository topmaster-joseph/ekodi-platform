import test from 'node:test';
import assert from 'node:assert/strict';
import { auditBbqcgProduction } from '../scripts/verify-bbqcg-production-readonly.mjs';

const noindex={'x-robots-tag':'noindex,nofollow,noarchive'};
const html={...noindex,'content-type':'text/html; charset=utf-8'};
const attachment=(filename,type)=>({...noindex,'content-type':type,'content-disposition':'attachment; filename="'+filename+'"','cache-control':'no-store'});
const response=(body,status=200,headers=html)=>new Response(body,{status,headers});
const responses={
  '/bbqcg':()=>response('<html data-store-entity="bbqcg"><link href="/bbqcg/assets/site.css?v=f5039d1882912cbd">우리 매장의 약속과 자료실 <a href="/bbqcg/service-guide">자료</a></html>'),
  '/bbqcg/service-guide':()=>response('매장 소개 · 자료 다운로드 <a href="/bbqcg/resources/store-promise.html">안내문</a><a href="/bbqcg/resources/qcs-gms-checklist.csv">점검표</a>'),
  '/bbqcg/resources/store-promise.html':method=>response(method==='HEAD'?null:'BBQ 무안청계점 좋은 한 끼를 위한 세 가지 약속',200,attachment('bbqcg-store-promise.html','text/html; charset=utf-8')),
  '/bbqcg/resources/qcs-gms-checklist.csv':method=>response(method==='HEAD'?null:'\uFEFF"구분","단계","점검 항목","확인 여부","조치 사항"\r\n',200,attachment('bbqcg-qcs-gms-checklist.csv','text/csv; charset=utf-8')),
  '/bbqcheonggye':()=>response('gone',410,noindex),
  '/bbqcg/admin/pos':()=>response('<!doctype html><html data-ekodi-store-brand="bbqcg"><meta name="robots" content="noindex,nofollow">BBQ 무안청계점</html>'),
  '/store-admin.js':()=>response("function mountBbqPosTabs(){const options=[['programs','프로그램'],['orders','최근 주문'],['channels','배달플랫폼'],['agent','Agent 관리']];const key='data-bbq-pos-tab';const tab='posTab'}",200,{'content-type':'text/javascript; charset=utf-8'}),
  '/store-admin.css':()=>response('.bbq-pos-subtabs{display:flex}@media(max-width:620px){.bbq-pos-subtabs{overflow-x:auto}}',200,{'content-type':'text/css; charset=utf-8'})
};
function stub(overrides={}){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    const u=new URL(url);
    calls.push([u.pathname,options.method,options.redirect]);
    assert.equal(u.origin,'https://ekodi.kr');
    assert.ok(['GET','HEAD'].includes(options.method),'canary may never mutate via network');
    assert.equal(options.redirect,'manual');
    const result=(overrides[u.pathname]||responses[u.pathname]);
    if(!result)throw new Error('Unexpected path '+u.pathname);
    return result(options.method);
  };
  return {fetchImpl,calls};
}
test('BBQ guest live verifier audits canonical assets, QCS downloads, HEAD and retired route without writes',async()=>{
  const {fetchImpl,calls}=stub();
  const report=await auditBbqcgProduction({fetchImpl});
  assert.equal(report.ok,true,JSON.stringify(report.records.filter(x=>x.errors.length)));
  assert.equal(report.records.length,10);
  assert.deepEqual(calls.filter(x=>x[1]==='HEAD').map(x=>x[0]),[
    '/bbqcg/resources/store-promise.html','/bbqcg/resources/qcs-gms-checklist.csv'
  ]);
  assert.equal(report.authenticatedTenantInteractionVerified,false);
  assert.ok(report.records.every(x=>!x.errors.length));
});
test('guest auth redirect is recognized as boundary, never mistaken for authorized role',async()=>{
  const {fetchImpl}=stub({'/bbqcg/admin/pos':()=>response(null,302,{'location':'https://ekodi.kr/auth/?site=space'})});
  const report=await auditBbqcgProduction({fetchImpl});
  assert.equal(report.ok,true,JSON.stringify(report.records.filter(x=>x.errors.length)));
  assert.equal(report.records.find(x=>x.id==='admin-guest').authenticatedRoleVerified,false);
});
test('wrong CSS and legacy redirects fail closed with attributable evidence',async()=>{
  const {fetchImpl}=stub({
    '/store-admin.css':()=>response('.old-ui{}',200,{'content-type':'text/css'}),
    '/bbqcheonggye':()=>response(null,302,{'location':'https://ekodi.kr/bbqcg'})
  });
  const report=await auditBbqcgProduction({fetchImpl});
  assert.equal(report.ok,false);
  assert.ok(report.records.find(x=>x.id==='admin-styles').errors.includes('admin-compact-mobile-rules'));
  assert.ok(report.records.find(x=>x.id==='retired-route').errors.includes('retired-path-410'));
});
test('rate-limit response opens circuit breaker instead of continuing requests',async()=>{
  const {fetchImpl,calls}=stub({'/bbqcg/service-guide':()=>response('throttled',429,{'content-type':'text/plain'})});
  const report=await auditBbqcgProduction({fetchImpl});
  assert.equal(report.ok,false);
  assert.equal(report.circuitOpen,true);
  assert.equal(calls.length,2);
});
