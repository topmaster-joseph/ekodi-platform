import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');

test('Amazon remains routed as a Mall sales-channel subitem without changing existing canonical URLs',()=>{
  assert.match(source,/판매채널 \/ 아마존/);
  assert.match(source,/admin-nav-nested/);
  assert.match(source,/key==='amazon'&&service==='mall'/);
  assert.match(source,/if\(section==='amazon'\)return amazonAdmin\(\)/);
  assert.match(source,/\/ekodimall\/api\/amazon\/status/);
});
test('Amazon workbench separates seller connection, read-only operations and costly optional settings',()=>{
  assert.match(source,/amazonAccountSettings/);
  assert.match(source,/amazonCostSettings/);
  assert.match(source,/amazonOptionalServices/);
  assert.match(source,/amazonReadonlySection/);
  assert.match(source,/amazon-credential-grid/);
  assert.match(source,/amazon-refresh/);
  assert.match(source,/aria-live="polite"/);
  assert.match(source,/connection\.configured\?'':'disabled'/);
  assert.match(source,/상품 · 재고 · 주문/);
});
test('Amazon cost governance and server-side credential protection remain in place',()=>{
  assert.match(source,/amazonConnectionForm/);
  assert.match(source,/autocomplete="new-password"/);
  assert.match(source,/\/ekodimall\/api\/amazon\/connection\/test/);
  assert.match(source,/\/ekodimall\/api\/amazon\/sync\/read-only/);
  assert.match(source,/\/ekodimall\/api\/amazon\/cost-policy/);
  assert.match(source,/\/ekodimall\/api\/amazon\/approvals/);
  assert.match(source,/유료 기능 스위치를 켜더라도 기능별 승인 레코드와 금액 한도가 없으면/);
});
