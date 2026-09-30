import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../personal-finance-admin.js',import.meta.url),'utf8');

test('Personal Finance refreshes when the shared Admin panel controller activates it',()=>{
  assert.match(source,/function refreshWhenSharedNavigationActivates\(event\)/);
  assert.match(source,/ekodi-admin-section-changed',refreshWhenSharedNavigationActivates/);
  assert.match(source,/window\.EKODIAdminPanels\?\.current\?\.\(\)/);
  assert.match(source,/host\.hidden\|\|host\.classList\.contains\('hidden-panel'\)/);
  assert.match(source,/void refresh\(\)/);
  assert.match(source,/queueMicrotask\(\(\)=>refreshWhenSharedNavigationActivates\(\)\)/);
});

test('Personal Finance exposes a bounded activation hook without bypassing shared navigation',()=>{
  assert.match(source,/EKODIPersonalFinanceAdmin=Object\.freeze\(\{refresh,activate:/);
  assert.match(source,/AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/);
  assert.doesNotMatch(source,/window\.location\.reload/);
});
