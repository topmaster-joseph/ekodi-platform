import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  REQUIRED_SHELL_MARKERS,
  missionPageEntries,
  validateMissionPageSource,
  validateMissionShellSource,
  validateMissionShellCss,
  validateMissionShellContract,
} from '../scripts/validate-ekodimission-shell-contract.mjs';

test('production verifier markers are exported from the shared contract module',()=>{
  assert.ok(Array.isArray(REQUIRED_SHELL_MARKERS));
  assert.ok(REQUIRED_SHELL_MARKERS.includes('data-mission-nav'));
  assert.ok(REQUIRED_SHELL_MARKERS.includes('/ekodimission/assets/shell.js'));
});

test('mission registry discovery is automatic for current and future page routes',async()=>{
  const result=await validateMissionShellContract();
  assert.ok(result.pageCount>=11);
  assert.ok(result.routes.includes('/ekodimission/live'));
  assert.ok(result.routes.includes('/ekodimission/history'));
  assert.ok(result.pageCount>=15);
  assert.ok(result.routes.includes('/ekodimission/contact'));
  assert.ok(result.routes.includes('/ekodimission/apply/260926-open-table'));
  assert.ok(!result.routes.includes('/ekodimission/activities/260926-chuseok-open-table'));
});

test('mission page guard rejects a new route that implements its own header',()=>{
  assert.throws(()=>validateMissionPageSource('<header class="site-header"><nav><a href="/x">x</a></nav></header>','fixture'),/missing class="mission-site-header"/);
});

test('mission language guard rejects preparing locales and non-published option strategies',()=>{
  const invalid=`window.EKODI_MISSION_NAVIGATION_CONTRACT={};visibility:'published-only';language-registry.json;api/i18n/v1/status?service=mission;api/i18n/v1/catalog?service=mission;languages.filter(item=>published.has(item.locale));select.setAttribute('aria-label','언어 선택');nav.replaceChildren(...links,language);/ekodimission/activities;/ekodimission/live;/ekodimission/participate;/ekodimission/partners;/ekodimission/stories;준비 중`;
  assert.throws(()=>validateMissionShellSource(invalid),/preparing language text/);
});

test('mission mobile shell guard requires all responsive breakpoints',()=>{
  assert.throws(()=>validateMissionShellCss('.mission-site-header{}.mission-language select{border-radius:999px}@media(max-width:900px){flex-wrap:wrap}'),/max-width:620px/);
});

test('mission page registry parser rejects unsupported route expressions instead of silently skipping them',()=>{
  const worker=`const MISSION_EVENT_SLUG='x';const EKODIMISSION_PAGES=new Map([[SOME_NEW_ROUTE,'/new.page']]);`;
  assert.throws(()=>missionPageEntries(worker),/No EKODI Mission pages discovered|Unsupported/);
});


test('Space release probe follows the published autumn trip content instead of stale draft values',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/space.worker.json',import.meta.url),'utf8'));
  const probe=(manifest.worker?.requests||[]).find(item=>item.url==='https://ekodi.kr/ekodimission/api/activities/261003-autumn-community-trip/content');
  assert.ok(probe);
  assert.ok(probe.expect?.includes('261003-autumn-community-trip'));
  assert.ok(probe.expect?.includes('50000'));
  assert.ok(probe.expect?.includes('2026 가을 공동체 여행'));
  assert.equal(probe.expect?.includes('100000'),false);
  assert.equal(probe.expect?.includes('에코디선교회'),false);
});


test('autumn trip static page matches the published 50k 15-person content',async()=>{
  const page=await readFile(new URL('../space/ekodimission-autumn-trip-apply.page',import.meta.url),'utf8');
  assert.ok(page.includes('data-trip-fee>50,000원</span>'));
  assert.ok(page.includes('data-trip-capacity>15</span>'));
  assert.ok(page.includes('참가비는 1인 5만원이며 추가비용은 후원으로 충당합니다.'));
  assert.equal(page.includes('data-trip-fee>100,000원</span>'),false);
  assert.equal(page.includes('예배'),false);
});
