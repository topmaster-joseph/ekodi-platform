import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {storeAdminCanAccess,storeAdminSectionsForRole,storeAdminPage,storeAdminCss,storeAdminScript} from '../store-admin-engine.js';
const source=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('active tenant administrator has dashboard rights; unassigned member does not',()=>{
  for(const role of ['tenant_admin','store_owner','platform_admin']){
    assert.equal(storeAdminCanAccess(role,'overview'),true,role);
    assert.ok(storeAdminSectionsForRole(role).includes('overview'));
  }
  for(const role of ['member','customer','','unverified']){
    assert.equal(storeAdminCanAccess(role,'overview'),false,role);
  }
});

test('BBQ administrator shows accurate account/role recovery, not same-page self-link',async()=>{
  const script=await storeAdminScript().text();
  assert.match(script,/이 계정에 매장 운영 권한이 없습니다/);
  assert.match(script,/현재 로그인 계정/);
  assert.match(script,/다른 Google 계정으로 로그인/);
  assert.match(script,/select_account/);
  assert.doesNotMatch(script,/허용된 운영 홈으로/);
  const html=await storeAdminPage({slug:'bbqcg',name:'BBQ 무안청계점',mark:'ST'}).text();
  assert.match(html,/data-ekodi-store-brand="bbqcg"/);
  assert.match(html,/store-admin\.css\?v=20261108-bbqcg-compact-v1/);
  assert.match(html,/store-admin\.js\?v=20261108-bbqcg-compact-v1/);
  const other=await storeAdminPage({slug:'jadam',name:'자담치킨'}).text();
  assert.match(other,/store-admin\.css\?v=20261028-today-board-v1/);
});

test('BBQ-only light mobile theme overrides dark common admin Shell, no sibling change',async()=>{
  const css=await storeAdminCss().text();
  assert.match(css,/:root\[data-ekodi-store-brand="bbqcg"\]\[data-ekodi-shell-surface="admin"\]/);
  assert.match(css,/background:#f5f7f4!important/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/\.heading h1\{font-size:clamp\(20px,5vw,24px\)/);
  assert.doesNotMatch(css,/:root\[data-ekodi-shell-surface="admin"\]\{color-scheme:light/);
});

test('space Google account switch is explicit and return-url is preserved',async()=>{
  const login=await source('auth-site/client-auth.js');
  const entry=await source('auth-site/auth-entry.js');
  assert.match(login,/SPACE_CHOOSE_ACCOUNT=site==='space'&&params\.get\('select_account'\)==='1'/);
  assert.match(login,/if\(SPACE_CHOOSE_ACCOUNT\)\{await renderGoogle\(\);return\}/);
  assert.match(login,/SPACE_CHOOSE_ACCOUNT\)googleButtonOptions/);
  assert.match(entry,/params\.get\('site'\) === 'space' && params\.get\('select_account'\) === '1'/);
  const adminUrl=new URL('https://ekodi.kr/auth/?site=space');
  adminUrl.searchParams.set('return_to','https://ekodi.kr/bbqcg/admin?tab=overview');
  adminUrl.searchParams.set('select_account','1');
  assert.equal(adminUrl.searchParams.get('return_to'),'https://ekodi.kr/bbqcg/admin?tab=overview');
});

test('BBQ authorization SQL scope, role and release pin remain closed',async()=>{
  const sql=await source('supabase/migrations/20261108163500_bbqcg_tenant_admin_store_access.sql');
  assert.match(sql,/private\.has_store_private_access/);
  assert.match(sql,/public\.stores s/);
  assert.match(sql,/public\.tenant_members tm on tm\.tenant_id=s\.tenant_id/);
  assert.match(sql,/tm\.status='active'/);
  assert.match(sql,/tm\.role::text in \('tenant_admin','platform_admin'\)/);
  assert.match(sql,/auth\.uid\(\) is not null/);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.(tenant_members|store_members)/i);
  assert.doesNotMatch(sql,/update\s+public\.profiles/i);
  const workflow=await source('.github/workflows/deploy-space.yml');
  assert.match(workflow,/BBQ_STORE_ACCESS_MIGRATION/);
  assert.match(workflow,/BBQ_STORE_ACCESS_PINNED_BLOB/);
  assert.match(workflow,/Verify BBQ CG canonical host and retired-URL hard block/);
});


test('BBQ operations handbook is local to approved site work section and print cards remain templates',async()=>{
  const script=await storeAdminScript().text();
  const css=await storeAdminCss().text();
  assert.match(script,/if\(SLUG==='bbqcg'\)return bbqCgHandbookPanel\(\)/);
  for(const tab of ['조리 레시피','위생·안전','법령·의무사항','일일점검','인쇄 관리'])assert.ok(script.includes(tab),tab);
  assert.match(script,/본사 최신 조리지침 확인 후 승인/);
  assert.match(script,/본사 원본 확인 후 기입/);
  assert.match(script,/출력기록은 자동 저장되지 않습니다/);
  assert.match(script,/https:\/\/www\.law\.go\.kr\//);
  assert.match(script,/https:\/\/www\.foodsafetykorea\.go\.kr\//);
  assert.match(css,/@media print/);
  assert.match(css,/bbqcg-print-mode/);
  assert.match(css,/data-print-target="all"/);
  assert.doesNotMatch(script,/bbqe-learning\.co\.kr.{0,100}(token|password|비밀번호)/i);
});


test('BBQ left-nav content is direct, without redundant right-side heading and work/metrics switches',async()=>{
  const bbq=await storeAdminPage({slug:'bbqcg',name:'BBQ 무안청계점',pathname:'/bbqcg/admin/pos'}).text();
  const other=await storeAdminPage({slug:'jadam',name:'자담치킨',pathname:'/jadam/admin/pos'}).text();
  const css=await storeAdminCss().text();
  assert.match(bbq,/id="mainPanel" role="region" aria-label="매장 관리 화면"/);
  assert.doesNotMatch(bbq,/class="admin-view-tabs"/);
  assert.match(other,/class="admin-view-tabs"/);
  assert.match(other,/id="mainPanel" role="tabpanel" aria-labelledby="adminWorkTab"/);
  assert.match(css,/:root\[data-ekodi-store-brand="bbqcg"\]:not\(\[data-ekodi-store-portfolio\]\) \.layout main>\.heading/);
  assert.match(css,/:root\[data-ekodi-store-brand="bbqcg"\]:not\(\[data-ekodi-store-portfolio\]\) \.layout main>#summaryCards\{display:none!important\}/);
  assert.match(css,/#bbqcgHandbook \.bbqcg-handbook-tabs\{order:-1;justify-content:flex-end/);
});
test('BBQ-only POS tabs are upper-right, keyboard navigable and restore selected content on refresh',async()=>{
  const script=await storeAdminScript().text();
  const css=await storeAdminCss().text();
  assert.match(script,/function mountBbqPosTabs\(\)/);
  for(const key of ['programs','orders','channels','agent'])assert.ok(script.includes("['"+key+"'"),key);
  assert.match(script,/if\(SLUG==='bbqcg'&&!IS_PORTFOLIO\)mountBbqPosTabs\(\)/);
  assert.match(script,/aria-selected/);
  assert.match(script,/ArrowLeft/);
  assert.match(script,/ArrowRight/);
  assert.match(script,/url\.searchParams\.set\('posTab',id\)/);
  assert.match(script,/history\.replaceState\(history\.state/);
  assert.match(script,/state\.posSubTab=id/);
  assert.match(script,/if\(SLUG==='bbqcg'&&!IS_PORTFOLIO\)\{\s*\/\/ Draw the local store's selected workspace immediately\./);
  assert.match(script,/renderPosConsole\(\);\s*await probePosAgent\(\);\s*if\(section==='pos'\)renderPosConsole\(\)/);
  assert.match(css,/\.bbq-pos-subtabs\{display:flex;align-items:center;justify-content:flex-end/);
  assert.match(css,/\[data-bbq-pos-pane\]\[hidden\]/);
  assert.match(css,/@media\(max-width:620px\)/);
  // No changes to POS bridge permissions or machine-application launch behavior.
  assert.match(script,/await posAgent\('\/v1\/focus'/);
  assert.match(script,/button\.onclick=async/);
});


test('BBQ-only optional 403 does not deny the authorized operating dashboard and handbook',async()=>{
  const js=await storeAdminScript().text();
  assert.match(js,/if\(SLUG==='bbqcg'\)\{/);
  assert.match(js,/if\(section==='work'\)\{/);
  assert.match(js,/Promise\.allSettled\(\[/);
  assert.match(js,/const primarySnapshot=await rpc\('business_os_store_admin_snapshot'/);
  assert.match(js,/state\.snapshot=primarySnapshot/);
  assert.match(js,/status==='fulfilled'/);
  assert.match(js,/state\.connector=available\(0\)\|\|\{connectors:\[\]\}/);
  assert.match(js,/매장 운영 · 일부 채널 확인 필요/);
  // The existing shared path and hard store membership gate remain unchanged.
  assert.match(js,/const menu=await rpc\('store_operating_space_snapshot'/);
  assert.match(js,/state\.menu=menu;if\(!canSection\(section,role\)\)return permissionPanel\(\)/);
  assert.match(js,/const \[snapshot,connector,delivery,commerce,smsOrders\]=await Promise\.all\(\[/);
  assert.doesNotMatch(js,/if\(SLUG==='bbqcg'\)\{[\s\S]*?state\.role='tenant_admin'/);
});

test('BBQ menu-specific recipe and shrinkflation portion cards use real tenant menu only',async()=>{
  const script=await storeAdminScript().text();
  const css=await storeAdminCss().text();
  const html=await storeAdminPage({slug:'bbqcg',name:'BBQ 무안청계점',pathname:'/bbqcg/admin/work'}).text();
  assert.match(script,/const canonicalMenus=\(Array\.isArray\(state\.menu\?\.menu\)\?state\.menu\.menu:\[\]\)/);
  assert.match(script,/const selectedMenuNames=new Map\(canonicalMenus\.map/);
  assert.match(script,/const tabs=\[\.\.\.sections,\{id:'menuRecipe',label:'메뉴별 레시피'\},\{id:'portion',label:'정량·용량표시'\}\]/);
  for(const marker of ['공식 문서번호·출처','승인 버전·확인일','본사 승인 자료','이전 고객 표시량','현재 고객 표시량','실제 계량 제공량','계량 기준','측정자','data-bbq-portion-result'])
    assert.ok(script.includes(marker),'missing card field: '+marker);
  assert.match(script,/Number\.isFinite\(value\)\&\&value>0/);
  assert.match(script,/if\(!select\.value\)notes\.push\('메뉴 미선택'\)/);
  assert.ok(script.includes("const comparable=Boolean(kind&&(kind!=='chicken'||(stage==='조리 전'&&unit==='g')))"));
  assert.match(script,/card\.querySelector\('\[data-bbq-portion-result\]'\)\.textContent/);
  assert.match(script,/for\(const input of fields\)\{if\(input\.tagName==='SELECT'\)input\.selectedIndex=0;else input\.value=''\}/);
  assert.match(script,/이 입력은 서버·브라우저 저장소에 저장되지 않습니다/);
  assert.match(script,/법령 위반 자동 판정 아님/);
  assert.match(css,/data-print-target="menuRecipe"/);
  assert.match(css,/data-print-target="portion"/);
  assert.match(css,/#bbqcgHandbook \.bbqcg-card-fields\{display:grid/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(html,/data-ekodi-store-brand="bbqcg"/);
  assert.doesNotThrow(()=>new Function(script),'browser payload must remain valid JavaScript');
});
test('BBQ operator cards remain private templates; no default quantity or unauthorized publishing',async()=>{
  const script=await storeAdminScript().text();
  const publicHtml=await storeAdminPage({slug:'jadam',name:'자담치킨',pathname:'/jadam/admin/work'}).text();
  assert.ok(!publicHtml.includes('data-ekodi-store-brand="bbqcg"'));
  assert.match(script,/if\(SLUG==='bbqcg'\)return bbqCgHandbookPanel\(\)/);
  assert.match(script,/if\(!roleCapabilities\(role\)\.length\)throw/);
  assert.match(script,/state\.menu=menu;if\(!canSection\(section,role\)\)return permissionPanel\(\)/);
  assert.doesNotMatch(script,/localStorage\.setItem\([^)]*bbqcg-card/i);
  assert.doesNotMatch(script,/fetch\([^)]*bbqcg-card/i);
  assert.match(script,/미승인 초안/);
  assert.match(script,/현재 매장 기준메뉴 원장이 없습니다/);
});

test('BBQ typed recipe text prints in full without HTML injection or textarea clipping',async()=>{
  const script=await storeAdminScript().text();
  const css=await storeAdminCss().text();
  assert.match(script,/data-bbq-print-value/);
  assert.match(script,/input\.closest\('\.bbqcg-card-field'\)/);
  assert.match(script,/preview\.textContent=String\(value\|\|''\)\.trim\(\)\|\|'미입력'/);
  assert.match(script,/미입력/);
  assert.match(css,/\.bbqcg-print-value\{display:none\}/);
  assert.match(css,/@media print/);
  assert.match(css,/\.bbqcg-card-field textarea,?/);
  assert.match(css,/\.bbqcg-card-field \.bbqcg-print-value\{display:block!important;white-space:pre-wrap/);
  assert.doesNotMatch(script,/preview\.innerHTML=/);
  assert.doesNotThrow(()=>new Function(script));
});

test('BBQ 2026 chicken mandatory pre-cook weight guidance stays private and evidence-first',async()=>{
  const js=await storeAdminScript().text();
  const css=await storeAdminCss().text();
  assert.match(js,/치킨 중량표시제: BBQ 등 적용 브랜드는 조리 전 원료육 중량/);
  assert.match(js,/시행 2025-12-15, 계도종료 2026-06-30/);
  assert.match(js,/korea\.kr\/news\/policyNewsView\.do\?newsId=148955694/);
  for(const label of ['표시 대상 분류','치킨·닭고기 메뉴','사이드·음료·기타','메뉴판·배달앱 표시 문구(g/호수 등)','표시 확인 위치(매장·배달앱·온라인)','조리 전 원료육·입고 확인 근거'])
    assert.ok(js.includes(label),label);
  assert.match(js,/if\(kind==='chicken'\)\{/);
  assert.match(js,/if\(stage!=='조리 전'\)notes\.push/);
  assert.match(js,/if\(unit==='mL'\)notes\.push/);
  assert.match(js,/if\(unit==='개'\)notes\.push/);
  assert.match(js,/고객 표시 문구 미확인/);
  assert.match(js,/매장·배달앱·온라인 표시 확인 필요/);
  assert.match(js,/법령 위반 자동 판정 아님/);
  assert.match(css,/\.bbqcg-card-policy\{padding:/);
  assert.doesNotMatch(js,/2000g 이상 반드시|10호만 사용/i);
  assert.doesNotThrow(()=>new Function(js));
});

test('BBQ capacity card prints unit/basis/type and suppresses invalid chicken comparisons',async()=>{
  const js=await storeAdminScript().text();
  const css=await storeAdminCss().text();
  for(const key of ['kind','unit','stage'])
    assert.match(js,new RegExp('data-bbq-print-value="'+key+'"'),key+' print mirror');
  assert.ok(js.includes("if(comparable&&previous!==null&&declared!==null)"));
  assert.ok(js.includes("if(comparable&&declared!==null&&measured!==null&&stage)"));
  assert.match(js,/preview\.textContent=String\(value\|\|''\)\.trim\(\)\|\|'미입력'/);
  assert.match(css,/\.bbqcg-print-value\{display:none\}/);
  assert.match(css,/\.bbqcg-card-field \.bbqcg-print-value\{display:block!important;white-space:pre-wrap/);
  assert.doesNotThrow(()=>new Function(js));
});

test('BBQ chicken ho-size range and piece units are recorded without false gram comparisons',async()=>{
  const script=await storeAdminScript().text();
  assert.ok(script.includes('<option value="호">호(원료육 중량범위)</option>'));
  assert.ok(script.includes("if(unit==='호')notes.push('호수별 원료육 g 중량범위·본사 승인 문구 확인 필요')"));
  assert.ok(script.includes("if(kind==='chicken'&&!comparable)notes.push('치킨 중량의 증감률·실측 차이 계산은 조리 전 g 기준만 지원')"));
  assert.ok(script.includes("const comparable=Boolean(kind&&(kind!=='chicken'||(stage==='조리 전'&&unit==='g')))"));
  for(const key of ['kind','unit','stage'])assert.ok(script.includes('data-bbq-print-value="'+key+'"'));
  assert.match(script,/법령 위반 자동 판정 아님/);
  assert.doesNotThrow(()=>new Function(script));
});
