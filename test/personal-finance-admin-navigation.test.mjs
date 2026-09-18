import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../personal-finance-admin.js',import.meta.url),'utf8');

test('Personal Finance refreshes when the shared Admin panel controller activates it',()=>{
  assert.match(source,/function refreshWhenSharedNavigationActivates\(event\)/);
  assert.match(source,/ekodi-admin-section-changed',refreshWhenSharedNavigationActivates/);
  assert.match(source,/window\.EKODIAdminPanels\?\.current\?\.\(\)/);
  assert.match(source,/panel\.hidden\|\|panel\.classList\.contains\('hidden-panel'\)/);
  assert.match(source,/void refresh\(\)/);
  assert.match(source,/queueMicrotask\(\(\)=>refreshWhenSharedNavigationActivates\(\)\)/);
});

test('Personal Finance exposes an activation hook without bypassing the shared panel controller',()=>{
  assert.match(source,/EKODIPersonalFinanceAdmin=Object\.freeze\(\{refresh,activate:/);
  assert.doesNotMatch(source,/window\.location\.reload/);
});
