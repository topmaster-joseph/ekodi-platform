import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ADMIN_MENUS, ADMIN_MENU_REGISTRY, getAdminMenuForSection } from '../admin-menu-registry.js';

const read = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('Search Visibility is an EKODI super-admin registry menu with a single canonical section',()=>{
  const entry=ADMIN_MENU_REGISTRY.find(x=>x.id==='search-visibility');
  assert.ok(entry);
  assert.equal(entry.group,'ai');
  assert.equal(entry.superAdminOnly,true);
  assert.ok(ADMIN_MENUS.some(x=>x.id==='growth-intelligence'&&x.sections.includes('search-visibility')));
  assert.equal(getAdminMenuForSection('search-visibility')?.id,'growth-intelligence');
  const audience=JSON.parse(read('config/admin-menu-audience-policy.json'));
  assert.equal(audience.classification.entries['search-visibility'].audience,'platform-super-admin');
});
test('Canonical and friendly routes both resolve to the visibility section',()=>{
  const location={href:'https://ekodi.kr/admin/',hostname:'ekodi.kr',pathname:'/admin/',search:'',hash:''};
  const window={location};
  vm.runInNewContext(read('admin-canonical-routes.js'),{window,URL,URLSearchParams,Object,Set,String,Array,decodeURIComponent,encodeURIComponent});
  const routes=window.EKODIAdminRoutes;
  assert.equal(routes.pathFor('search-visibility'),'/admin/ai/search-visibility');
  assert.equal(routes.routeFromPath('/admin/growth/search')?.section,'search-visibility');
  assert.equal(routes.routeFromPath('/admin/settings/search-visibility')?.section,'search-visibility');
});
test('Search visibility is source-available and deployable through the guarded site worker',()=>{
  assert.match(read('scripts/build.mjs'),/'search-visibility-admin.js'/);
  assert.match(read('site-worker.js'),/'\/search-visibility-admin.js'/);
  assert.match(read('admin-menu-registry.js'),/import\('\.\/search-visibility-admin.js'\)/);
  assert.match(read('growth-os-admin.js'),/\/admin\/ai\/search-visibility/);
});
test('Compact runtime source hash matches readable menu and code parses',()=>{
  const source=read('admin-menu-layout.js').replace(/\r\n/g,'\n');
  const digest=createHash('sha256').update(source).digest('hex');
  const compact=read('admin-menu-layout.compact.js');
  assert.ok(compact.startsWith('// source-sha256:'+digest));
  assert.match(read('admin-menu-registry.js'),/ekodi-nav-changed/);
  const parsed=spawnSync(process.execPath,['--check',new URL('../search-visibility-admin.js',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(parsed.status,0,parsed.stderr);
});
test('Public read-only audit does not misrepresent indexing or submit provider credentials',()=>{
  const src=read('search-visibility-admin.js');
  assert.match(src,/public-registry.json/);
  assert.match(src,/EKODI-PUBLIC-DISCOVERY-002/);
  assert.match(src,/사이트별 검색 준비도와 등록 확인 현황/);
  assert.match(src,/AEO·GEO/);
  assert.match(src,/색인/);
  assert.doesNotMatch(src,/fetch\('https:\/\/indexing.googleapis.com/);
  assert.doesNotMatch(src,/localStorage\.setItem|POST.*indexnow/);
});

test('Provider matrix lists primary search engines, IndexNow participants and AI search separately',()=>{
  const src=read('search-visibility-admin.js');
  assert.match(src,/SEARCH_PROVIDERS/);
  for(const engine of ['네이버','구글','다음','빙']) assert.ok(src.includes(engine),'missing '+engine);
  for(const member of ['Yandex','Seznam.cz','Yep','Amazon']) assert.ok(src.includes(member),'missing '+member);
  for(const assistant of ['ChatGPT Search','Google AI Overviews/AI Mode','Microsoft Copilot','Perplexity','Claude Search']) assert.ok(src.includes(assistant),'missing '+assistant);
  assert.match(src,/data-sv-provider-rows/);
  assert.match(src,/renderProviderMatrix/);
  assert.match(src,/외부 등록 여부 미확인|등록 여부 미확인/);
  assert.match(src,/실제 인용 근거 미확인/);
  assert.match(src,/하위 경로별 기술 진단과 호스트 단위 소유권 인증은 구분/);
  assert.doesNotMatch(src,/providerStatus\s*=\s*['\"]verified/);
});

test('Site inventory presents a single-line classified register with numbered rows and a separate management panel',()=>{
  const src=read('search-visibility-admin.js');
  for(const label of ['번호','분류','사이트','주소','SEO','AEO·GEO','검색등록','관리'])
    assert.ok(src.includes('<th scope="col">'+label+'</th>'), 'missing compact column '+label);
  assert.match(src,/data-sv-manage-panel hidden/);
  assert.match(src,/siteCategory\(site\)/);
  assert.match(src,/index\+1/);
  assert.match(src,/row\.append\(num,category,name,locationCell,basic,ai,providerCell,action\)/);
  assert.match(src,/\.sv-site-name\{max-width:190px;overflow:hidden;text-overflow:ellipsis/);
  assert.match(src,/refreshManage\(\)/);
  assert.match(src,/\$\('#sv-category-filter'\)\.addEventListener\('change',render\)/);
  assert.match(src,/confirmed_manually/);
  assert.doesNotMatch(src,/미등록 확정/);
});

test('Production browser exercises Search Visibility filters, Manage and mobile without writes',()=>{
  const script=read('scripts/verify-admin-production-ui-e2e.mjs');
  const coverage=read('scripts/verify-search-visibility-interactions.mjs');
  assert.match(script,/verifySearchVisibilityInteractions\(page,artifactsDir,results\)/);
  assert.match(coverage,/await filter\.selectOption\(group\)/);
  assert.match(coverage,/await search\.fill\(firstName\)/);
  assert.match(coverage,/await first\.locator\('button'\)\.click\(\)/);
  assert.match(coverage,/await panel\.locator\('\[data-sv-manage-close\]'\)\.click\(\)/);
  assert.match(coverage,/page\.setViewportSize\(\{width:390,height:844\}\)/);
  assert.match(coverage,/forbiddenWrites\.length/);
  assert.match(coverage,/read-only-interaction/);
});
