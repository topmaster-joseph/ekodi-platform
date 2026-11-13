import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html=readFileSync(new URL('../assets/supplier-connectors.html', import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/supplier-connectors.js', import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/supplier-connectors.css', import.meta.url),'utf8');

test('task tabs each have matching hidden content and accessible names',()=>{
  for(const name of ['overview','lookup','dry-run','gates']){
    assert.match(html,new RegExp('id="connector-tab-'+name+'"[^>]*aria-controls="connector-panel-'+name+'"'));
    assert.match(html,new RegExp('id="connector-panel-'+name+'"[^>]*data-connector-panel="'+name+'"'));
  }
  assert.match(html,/role="tablist"/);
  assert.match(html,/role="tabpanel"/);
  assert.match(js,/history\.replaceState\(null,''/);
  assert.match(js,/new URLSearchParams\(location\.search\)\.get\('tab'\)/);
  assert.match(css,/\.connector-panel\[hidden\]\{display:none!important\}/);
});

test('the supplied API controls remain read-only or server safety gated',()=>{
  assert.match(html,/id="credentialSummary"/);
  assert.match(html,/id="readOnlyProbe"/);
  assert.match(html,/id="authProbeRetry"/);
  assert.match(html,/id="itemLookupForm"/);
  assert.match(html,/id="orderDryRunForm"/);
  assert.match(html,/자동발주 OFF/);
  assert.match(js,/\/api\/internal\/connectors\/domemae\/readiness/);
  assert.match(js,/\/api\/internal\/connectors\/domemae\/item-lookup/);
  assert.match(js,/\/api\/internal\/connectors\/domemae\/order-dry-run/);
  assert.match(js,/실제 주문 API는 호출하지 않았습니다/);
  assert.doesNotMatch(html,/name="password"|name="apiKey"/);
});

test('status is concise and never exposes the actor email, and login is canonical',()=>{
  assert.doesNotMatch(js,/\$\{r\.actor\}/);
  assert.match(js,/https:\/\/ekodi\.kr\/auth\//);
  assert.match(js,/return_to/);
  assert.match(js,/\.connector-panel input,\.connector-panel button/);
  assert.match(html,/aria-live="polite"/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(html,/id="connectorLogout"[^>]*hidden/);
  assert.match(css,/\.connector-page \.connector-actions button\[hidden\]\{display:none!important\}/);
  assert.match(js,/login\.hidden=signed;logout\.hidden=!signed/);
});

test('supplier console separates private operator lookup from public display rights',()=>{
  assert.match(html, /id="publicCatalogGate"[^>]*>권한 확인 전/);
  assert.match(html, /id="publicCatalogGateDetail"/);
  assert.match(html, /운영자 전용 상품조회/);
  assert.match(html, /에코디몰 공개 카탈로그/);
  assert.match(html, /방문자 공개권한과 별개/);
  assert.match(html, /출처·이미지 사용권/);
  assert.match(js, /async function refreshPublicCatalog\(\)/);
  assert.match(js, /\/api\/public\/supplier\/status/);
  assert.match(js, /state\?\.checkoutReady===false&&state\?\.autoOrderReady===false/);
  assert.match(js, /credentials:'omit'/);
  assert.doesNotMatch(html, /name="aid"|name="sId"|name="supplierPassword"/);
  assert.match(css, /\.connector-overview-strip\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});


test('connector dashboard labels administrator-only scope and gates remain truthful',()=>{
  assert.match(html, /<nav class="mall-admin-breadcrumb" aria-label="현재 위치">/);
  assert.match(html, /href="\/ekodimall\/">에코디몰 사용자 화면<\/a>/);
  assert.match(html, /<span class="mall-role-chip">관리자 전용<\/span>/);
  assert.match(html, /API 조회 권한과 일반 사용자 공개 권한은 별도로 검증합니다/);
  assert.match(css, /\.connector-page \.connector-overview-strip article\{/);
  assert.match(css, /\.connector-page \.connector-overview-strip strong\.connector-off\{/);
  assert.match(css, /\.connector-page \.connector-overview-strip article:nth-child\(4\) strong\.connector-off/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(html,/id="publicCatalogGate" class="connector-off">권한 확인 전/);
  assert.match(html,/class="connector-off">차단/);
  assert.doesNotMatch(html, /관리자 인증 성공|공개 카탈로그 승인 완료/);
});
