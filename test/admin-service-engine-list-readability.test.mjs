import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(name)=>readFileSync(path.join(root,name),'utf8');
const js=read('common-services-admin.js');
const css=read('common-services-admin.css');

test('engine list has one title, three summary cards, compact columns and inline filters',()=>{
  assert.match(js,/id="commonServicesTitle"/);
  assert.doesNotMatch(js,/id="commonServicesKicker"/);
  assert.doesNotMatch(js,/id="commonServicesDescription"/);
  assert.match(js,/id="commonServicesSearch"/);
  assert.match(js,/id="commonServicesStatusFilter"/);
  assert.match(js,/<span>서비스 엔진<\/span><span>점검 상태<\/span><span>상세<\/span>/);
  assert.match(js,/<small>점검 필요<\/small>/);
  assert.match(js,/const visible=categoryServices\(\)/);
  assert.match(js,/state\.statusFilter==='approval'/);
});
test('engine details appear only after selection, and deep links remain addressable',()=>{
  assert.match(js,/detailOpen:false/);
  assert.match(js,/if\(!state\.detailOpen\)\{detail\.hidden=true/);
  assert.match(js,/detail\.hidden=false/);
  assert.match(js,/state\.detailOpen=true;syncServiceUrl/);
  assert.match(js,/function clearServiceUrl\(\)/);
  assert.match(js,/id="commonServiceDetailClose"/);
});
test('module health keeps separate runtime and activation statuses',()=>{
  assert.match(js,/const moduleMode=state\.category==='service-modules'/);
  assert.match(js,/class="common-service-runtime"/);
  assert.match(js,/class="common-service-activation"/);
  assert.match(js,/공통·전문 모듈 점검/);
  assert.match(js,/Core 제외/);
  assert.match(js,/class="sr-only">기능/);
  assert.match(css,/\.common-services-panel\.module-health-mode \.common-service-card/);
});
test('compact list remains responsive and accessible',()=>{
  assert.match(css,/EKODI service engine compact list v3/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/\.common-service-detail\[hidden\]\{display:none!important\}/);
  assert.match(js,/aria-label.*런타임/);
});

test('service engine stylesheet uses a root-absolute canonical URL on nested admin paths',()=>{
  assert.match(js,/style\.href='\/common-services-admin\.css'/);
  assert.doesNotMatch(js,/style\.href='common-services-admin\.css'/);
  assert.match(read('site-worker.js'),/'\/common-services-admin\.css'/);
  const e2e=read('scripts/verify-admin-production-ui-e2e.mjs');
  assert.match(e2e,/ENGINE_CATALOG_STYLE_E2E/);
  assert.match(e2e,/menu-engine-all-mobile\.png/);
});

test('service engine mobile evidence closes drawer and proves cards are unobscured',()=>{
  const source=read('scripts/verify-admin-production-ui-e2e.mjs');
  assert.match(source,/const drawerScrim = page\.locator\('\[data-admin-drawer-scrim\]'\)/);
  assert.match(source,/if \(await drawerScrim\.isVisible\(\)\) await drawerScrim\.click\(\)/);
  assert.match(source,/!document\.body\.classList\.contains\('admin-mobile-drawer-open'\)/);
  assert.match(source,/mobile\.cardRight > mobile\.viewportWidth \+ 2/);
  assert.match(source,/menu-engine-all-mobile\.png/);
});
