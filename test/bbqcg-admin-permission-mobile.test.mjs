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
