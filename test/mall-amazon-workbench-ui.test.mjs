import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');

test('Amazon joins the Mall provider selector while its legacy URL stays compatible',()=>{
  assert.match(source,/function mallSourcingHeader\(sources,active\)/);
  assert.match(source,/data-mall-source-channel/);
  assert.match(source,/aria-pressed=/);
  assert.match(source,/if\(section==='amazon'\)return affiliateSourcingPanel\('amazon'\)/);
  assert.match(source,/await amazonAdmin\(\)/);
  assert.match(source,/\/ekodimall\/api\/amazon\/status/);
  assert.doesNotMatch(source,/\['sourcing','판매채널 · 공급망'\],\['amazon','Amazon'\]/);
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

test('Mall product table adds row order and only verified registration dates',()=>{
  assert.match(source,/products\.map\(\(item,index\)=>/);
  assert.match(source,/<th>연번<\/th>/);
  assert.match(source,/<th>등록일자<\/th>/);
  assert.match(source,/item\.registeredAt\|\|item\.createdAt\|\|item\.created_at/);
  assert.match(source,/미기록/);
  assert.match(source,/최근 동기화 시각은 등록일자로 사용하지 않습니다/);
});
