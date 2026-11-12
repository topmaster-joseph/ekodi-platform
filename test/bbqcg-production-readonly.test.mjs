import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditBbqcgProduction, hasBbqcgPosTabDefinitions, hasBbqcgMenuCardDefinitions, normalizeJsUnicodeEscapes, bbqIndexingProof, bbqIndexingSignals } from '../scripts/verify-bbqcg-production-readonly.mjs';
import { storeAdminScript } from '../store-admin-engine.js';

const noindex={'x-robots-tag':'noindex,nofollow,noarchive'};
const html={...noindex,'content-type':'text/html; charset=utf-8'};
const attachment=(filename,type)=>({...noindex,'content-type':type,'content-disposition':'attachment; filename="'+filename+'"','cache-control':'no-store'});
const response=(body,status=200,headers=html)=>new Response(body,{status,headers});
const cardContractFixture="const tabs=[{id:'menuRecipe'},{id:'portion'}];extraCard('menuRecipe', '레시피', '설명','필드');extraCard('portion','정량','설명','필드');data-bbq-card-menu data-bbq-print-value=\"kind\" data-bbq-print-value=\"unit\" data-bbq-print-value=\"stage\" 이전 고객 표시량 현재 고객 표시량 실제 계량 제공량 법령 위반 자동 판정 아님";
const responses={
  '/bbqcg':()=>response('<html data-store-entity="bbqcg"><meta name="robots" content="noindex,nofollow,noarchive"><link href="/bbqcg/assets/site.css?v=f5039d1882912cbd">우리 매장의 약속과 자료실 <a href="/bbqcg/service-guide">자료</a></html>'),
  '/bbqcg/service-guide':()=>response('매장 소개 · 자료 다운로드 <a href="/bbqcg/resources/store-promise.html">안내문</a><a href="/bbqcg/resources/qcs-gms-checklist.csv">점검표</a>'),
  '/bbqcg/resources/store-promise.html':method=>response(method==='HEAD'?null:'BBQ 무안청계점 좋은 한 끼를 위한 세 가지 약속',200,attachment('bbqcg-store-promise.html','text/html; charset=utf-8')),
  '/bbqcg/resources/qcs-gms-checklist.csv':method=>response(method==='HEAD'?null:'\uFEFF"구분","단계","점검 항목","확인 여부","조치 사항"\r\n',200,attachment('bbqcg-qcs-gms-checklist.csv','text/csv; charset=utf-8')),
  '/bbqcheonggye':()=>response('gone',410,noindex),
  '/bbqcg/admin/pos':()=>response('<!doctype html><html data-ekodi-store-brand="bbqcg"><meta name="robots" content="noindex,nofollow">BBQ 무안청계점</html>'),
  '/store-admin.js':()=>response("function mountBbqPosTabs(){const options=[['programs','프로그램','.pos-programs'],['orders','최근 주문','.pos-orders'],['channels','배달플랫폼','.pos-platforms'],['agent','Agent 관리','.pos-agent-guide']];const key='data-bbq-pos-tab';const tab='posTab'}"+cardContractFixture,200,{'content-type':'text/javascript; charset=utf-8'}),
  '/store-admin.css':()=>response('.bbq-pos-subtabs{display:flex}@media(max-width:620px){.bbq-pos-subtabs{overflow-x:auto}}.bbqcg-print-value{display:none} .bbqcg-card-policy{padding:8px} @media print {.bbqcg-print-value{white-space:pre-wrap}}',200,{'content-type':'text/css; charset=utf-8'})
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

test('production canary accepts the actual generated store-admin.js, not only hand-built fixtures',async()=>{
  const script=await (await storeAdminScript()).text();
  assert.equal(hasBbqcgPosTabDefinitions(script),true,'all 4 ID/label/pane tuples must be present in shipped JS');
  const {fetchImpl}=stub({'/store-admin.js':()=>response(script,200,{'content-type':'text/javascript; charset=utf-8'})});
  const report=await auditBbqcgProduction({fetchImpl});
  assert.equal(report.ok,true,JSON.stringify(report.records.filter(x=>x.errors.length)));
});
test('four-tab verifier tolerates quote/whitespace changes but rejects a missing or wrong pane',()=>{
  const valid='function mountBbqPosTabs(){ const options = [ ["programs", "프로그램", ".pos-programs"], ["orders","최근 주문",".pos-orders"], ["channels","배달플랫폼",".pos-platforms"], ["agent","Agent 관리",".pos-agent-guide"] ]; }';
  assert.equal(hasBbqcgPosTabDefinitions(valid),true);
  assert.equal(hasBbqcgPosTabDefinitions(valid.replace('["agent","Agent 관리",".pos-agent-guide"]','')),false);
  assert.equal(hasBbqcgPosTabDefinitions(valid.replace('".pos-orders"','".other-pane"')),false);
});

test('ASCII-escaped production bundler labels preserve actual four-tab contract',async()=>{
  const actual=await (await storeAdminScript()).text();
  const escaped=actual.replace(/[^\x00-\x7F]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
  assert.notEqual(escaped,actual,'fixture must introduce actual Unicode escapes');
  assert.match(escaped,/\\u[0-9a-fA-F]{4}/);
  assert.equal(hasBbqcgPosTabDefinitions(escaped),true,'bundled \\uXXXX labels should decode as data');
  const {fetchImpl}=stub({'/store-admin.js':()=>response(escaped,200,{'content-type':'text/javascript; charset=utf-8'})});
  const report=await auditBbqcgProduction({fetchImpl});
  assert.equal(report.ok,true,JSON.stringify(report.records.filter(row=>row.errors.length)));
});
test('Unicode escape normalization is data-only and handles braced/code-unit notation',()=>{
  const src='\\uD504\\uB85C\\uADF8\\uB7A8 \\u{0041} \\x42';
  assert.equal(normalizeJsUnicodeEscapes(src),'프로그램 A B');
  const oversized='\\u{110000}';
  assert.equal(normalizeJsUnicodeEscapes(oversized),oversized);
});

test('BBQ live canary requires deployed recipe, portion, weight basis and print assets from real generated script',async()=>{
  const actual=(await storeAdminScript()).text();
  const code=await actual;
  assert.equal(hasBbqcgMenuCardDefinitions(code),true,'shipped script must include both tenant-private print cards');
  const {fetchImpl}=stub({'/store-admin.js':()=>response(code,200,{'content-type':'text/javascript; charset=utf-8'})});
  const report=await auditBbqcgProduction({fetchImpl});
  assert.equal(report.ok,true,JSON.stringify(report.records.filter(x=>x.errors.length)));
  assert.ok(report.records.find(r=>r.id==='admin-script').checks.some(c=>c.key==='bbq-private-card-assets-delivered'&&c.passed));
  assert.equal(report.authenticatedTenantInteractionVerified,false);
});
test('menu card canary fails closed on missing unit print mirror or missing recipe template',async()=>{
  const real=await (await storeAdminScript()).text();
  const missingUnit=real.replace('data-bbq-print-value="unit"','data-bbq-print-value="missing-unit"');
  assert.notEqual(real,missingUnit,'fixture must remove one real marker');
  assert.equal(hasBbqcgMenuCardDefinitions(missingUnit),false);
  const missingRecipe=real.replace("extraCard('menuRecipe'","extraCard('disabledRecipe'");
  assert.notEqual(real,missingRecipe);
  assert.equal(hasBbqcgMenuCardDefinitions(missingRecipe),false);
  const {fetchImpl}=stub({'/store-admin.js':()=>response(missingUnit,200,{'content-type':'text/javascript; charset=utf-8'})});
  const report=await auditBbqcgProduction({fetchImpl});
  assert.equal(report.ok,false);
  assert.ok(report.records.find(r=>r.id==='admin-script').errors.includes('bbq-private-card-assets-delivered'));
});


test('BBQ public indexing requires three visible verified facts and matching robots meta',async()=>{
  const base='<html data-store-entity="bbqcg"><meta name="robots" content="index,follow"><link href="/bbqcg/assets/site.css?v=f5039d1882912cbd">우리 매장의 약속과 자료실 <a href="/bbqcg/service-guide">자료</a>';
  const facts='<div class="stats-bg"><section class="stats" id="guide">'
    +'<small>영업시간</small><strong>11:00 ~ 23:00</strong>'
    +'<small>매장전화</small><strong><a href="tel:0611234567">061-123-4567</a></strong>'
    +'<small>오시는 길</small><strong class="store-address">전남 무안군 청계면 시험로 1</strong>'
    +'</section></div>';
  const verified=base+facts+'</html>';
  assert.equal(bbqIndexingProof(verified,'index, follow'),true);
  const {fetchImpl}=stub({'/bbqcg':()=>response(verified,200,{
    'content-type':'text/html; charset=utf-8','x-robots-tag':'index, follow'
  })});
  const report=await auditBbqcgProduction({fetchImpl});
  assert.equal(report.ok,true,JSON.stringify(report.records.filter(x=>x.errors.length)));
  assert.ok(report.records.find(x=>x.id==='storefront').checks
    .some(x=>x.key==='storefront-robots-match-verified-facts'&&x.passed));
  // An indexable page that omits one public fact or has conflicting robots
  // MUST still fail even if the other public HTTP checks happen to succeed.
  for(const body of [
    verified.replace('11:00 ~ 23:00','매장 확인 후 안내'),
    verified.replace('tel:0611234567','#call'),
    verified.replace('전남 무안군 청계면 시험로 1','매장 확인 후 안내'),
    verified.replace('content="index,follow"','content="noindex,nofollow,noarchive"')
  ]){
    assert.equal(bbqIndexingProof(body,'index, follow'),false);
  }
  assert.equal(bbqIndexingProof(verified,'noindex, nofollow, noarchive'),false);
  assert.equal(bbqIndexingProof(verified,'index, nofollow'),false);
});

test('unverified BBQ must remain noindex; missing meta or advertised index fails closed',()=>{
  const unverified='<html><meta name="robots" content="noindex,nofollow,noarchive"><p>매장 확인 후 안내</p></html>';
  assert.equal(bbqIndexingProof(unverified,'noindex, nofollow, noarchive'),true);
  assert.equal(bbqIndexingProof(unverified.replace(/<meta[^>]+>/,''),'noindex, nofollow, noarchive'),false);
  assert.equal(bbqIndexingProof(unverified,'index, follow'),false);
});

test('BBQ public index evidence exposes Boolean-only diagnostics without relaxing restrictions',()=>{
  const good='<meta name="robots" content="index,follow"><small>영업시간</small><strong>매일 11:00 ~ 23:00</strong>'
    +'<small>매장전화</small><strong><a href="tel:0614538295">061-453-8295</a></strong>'
    +'<small>오시는 길</small><strong class="store-address">전남 무안군 청계면 승달산길 37-1, 건물 1층</strong>';
  const flags=bbqIndexingSignals(good,'index, follow');
  assert.equal(flags.noindexHeader,false);
  assert.equal(flags.noindexMeta,false);
  assert.equal(flags.indexHeader,true);
  assert.equal(flags.indexMeta,true);
  assert.equal(flags.metaSeen,true);
  assert.equal(flags.metaHasNoindex,false);
  for(const key of ['hours','phone','address'])assert.equal(flags[key],true,key);
  assert.equal(bbqIndexingProof(good,'index, follow'),true);
  const noindexMeta='<meta name="robots" content="noindex,nofollow,noarchive">';
  assert.equal(bbqIndexingProof(noindexMeta,'noindex, nofollow, noarchive'),true);
  assert.equal(bbqIndexingProof(noindexMeta,'index, follow'),false);
  assert.equal(bbqIndexingProof(good,'noindex, nofollow, noarchive'),false);
  assert.equal(Object.keys(flags).some(key=>/phonevalue|addressvalue|body|html/i.test(key)),false);
});

test('Operating Space guarded release uses the same fail-closed BBQ robots/public facts proof',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/deploy-space.yml',import.meta.url),'utf8');
  assert.match(workflow,/bbqIndexingProof\(body,robots\)/);
  assert.match(workflow,/bbqIndexingSignals\(body,robots\)/);
  assert.match(workflow,/x-robots-tag:/);
  assert.doesNotMatch(workflow,/Unverified BBQ store data must remain noindex/);
  assert.match(workflow,/Retired BBQ path must remain noindex/);
});

test('robots HTML meta allows harmless whitespace, quote/attribute order and previews but not contradictory noindex',()=>{
  const facts='<small>영업시간</small><strong>매일 11:00 ~ 23:00</strong>'
    +'<small>매장전화</small><strong><a href="tel:0614538295">061-453-8295</a></strong>'
    +'<small>오시는 길</small><strong class="store-address">전남 무안군 청계면 승달산길 37-1, 건물 1층</strong>';
  const variations=[
    '<meta name="robots" content="index, follow">',
    "<meta content='index,follow,max-image-preview:large' name='robots'>",
    '<META NAME="ROBOTS" CONTENT="index, follow, max-image-preview:large">'
  ];
  for(const meta of variations){
    assert.equal(bbqIndexingProof(meta+facts,'index, follow'),true,meta);
  }
  for(const meta of [
    '<meta name="robots" content="noindex, follow">',
    '<meta name="robots" content="index, nofollow">',
    '<meta name="robots" content="index, follow"><meta name="robots" content="noindex">',
    '<meta name="robots" content="none">',
    '<meta name="robots" content="index">',
    '<meta name="description" content="index, follow">'
  ]){
    assert.equal(bbqIndexingProof(meta+facts,'index, follow'),false,'blocked or absent robots contract '+meta);
  }
  const meta=bbqIndexingSignals('<meta name="robots" content="noindex,follow">','index, follow');
  assert.equal(meta.metaSeen,true);
  assert.equal(meta.metaHasNoindex,true);
  assert.equal(meta.indexMeta,false);
});
