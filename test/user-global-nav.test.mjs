import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('shared user navigation exposes the stable EKODI links only on user surfaces',async()=>{
  const nav=await read('shell/user-global-nav.js');
  assert.match(nav,/new Set\(\['public','workspace'\]\)/);
  assert.match(nav,/https:\/\/ekodi\.kr\//);
  assert.match(nav,/https:\/\/ekodi\.kr\/#services/);
  assert.match(nav,/https:\/\/ekodi\.kr\/history/);
  assert.match(nav,/https:\/\/my\.ekodi\.kr\//);
  assert.match(nav,/https:\/\/my\.ekodi\.kr\/#recommendations/);
  assert.match(nav,/https:\/\/auth\.ekodi\.kr\//);
  for(const label of ['홈','서비스','역사','마이 에코디','개인 AI 비서','로그인 · 계정'])assert.match(nav,new RegExp(label));
  assert.match(nav,/EKODI User AI/);
  assert.match(nav,/data-ekodi-global-link="assistant"/);
  assert.match(nav,/return_to/);
  assert.match(nav,/data-ekodi-user-global-nav/);
  assert.match(nav,/attachShadow\(\{mode:'open'\}\)/);
  assert.match(nav,/@media\(max-width:768px\)/);
  assert.match(nav,/aria-label','EKODI 사용자 공통 메뉴/);
});

test('Shell Worker bundles global navigation, shared chrome and language into one shell payload',async()=>{
  const worker=await read('ekodi-shell-worker.js');
  assert.match(worker,/user-global-nav\.js/);
  assert.match(worker,/user-ui-header\.js/);
  assert.match(worker,/user-ui-footer\.js/);
  assert.match(worker,/user-language\.js/);
  assert.match(worker,/admin-ui-shell\.js/);
  assert.match(worker,/globalNav/);
  assert.match(worker,/userLanguage/);
  assert.match(worker,/x-ekodi-user-language/);
  assert.match(worker,/x-ekodi-admin-ui-shell/);
  assert.match(worker,/\$\{shell\}\\n\$\{globalNav\}\\n\$\{userContext\}\\n\$\{userHeader\}\\n\$\{userFooter\}\\n\$\{userLanguage\}\\n\$\{adminShell\}\\n\$\{fixedHeader\}/);
});
