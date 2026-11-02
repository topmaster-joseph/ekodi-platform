import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = path => readFileSync(new URL(path, import.meta.url),'utf8');
test('Mall supplier admin lives under its own admin section and is server-role gated', () => {
  const page = file('../workspace-admin-page.js');
  const view = file('../mall-supplier-admin-view.js');
  assert.match(page, /suppliers:TENANT_ADMIN_CAPABILITIES\.supplyNetwork/);
  assert.match(page, /if\(section==='suppliers'\)return mallSuppliers\(\)/);
  assert.match(page, /renderMallSupplierAdmin\.toString\(\)/);
  assert.match(view, /api\/internal\/products\/by-provider/);
  assert.match(view, /privateData\.scope !== 'operator-read-only'/);
  assert.ok(view.indexOf("privateData.scope !== 'operator-read-only'") < view.indexOf("Promise.allSettled"), 'public catalog union only follows verified operator authority');
  assert.doesNotMatch(view, /POST|PUT|DELETE|setOrder/);
});
test('Mall admin lists upcoming candidate providers, separates checkout classes, and supports tabs and pagination', () => {
  const view = file('../mall-supplier-admin-view.js');
  for (const pattern of [/data-provider/, /mallSupplierMore/, /mallSupplierSearch/, /공급처 등록/, /외부 구매 연결/, /50개 더 보기/, /agoda\.com/, /trip\.com/]) {
    assert.match(view, pattern);
  }
  assert.match(view, /results\[1\]\.status === 'rejected'/);
  assert.match(view, /results\[2\]\.status === 'rejected'/);
});
