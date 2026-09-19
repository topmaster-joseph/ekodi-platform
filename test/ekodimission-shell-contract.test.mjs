import test from 'node:test';
import assert from 'node:assert/strict';
import {
  missionPageEntries,
  validateMissionPageSource,
  validateMissionShellSource,
  validateMissionShellCss,
  validateMissionShellContract,
} from '../scripts/validate-ekodimission-shell-contract.mjs';

test('mission registry discovery is automatic for current and future page routes',async()=>{
  const result=await validateMissionShellContract();
  assert.ok(result.pageCount>=11);
  assert.ok(result.routes.includes('/ekodimission/live'));
  assert.ok(result.routes.includes('/ekodimission/contact'));
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
