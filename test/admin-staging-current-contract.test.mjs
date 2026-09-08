import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/deploy-admin-staging.yml', import.meta.url), 'utf8');

test('Admin staging validates the current sales and supply-network contract', () => {
  assert.match(workflow, /LEGACY_MALL_AFFILIATE_HASHES/);
  assert.match(workflow, /MALL_SUPPLY_ADMIN/);
  assert.match(workflow, /id: 'supply-network'/);
  assert.match(workflow, /판매·공급망/);
  assert.match(workflow, /supply-network-admin\.js/);
  assert.doesNotMatch(workflow, /#mall-ai-sales:affiliates/);
  assert.doesNotMatch(workflow, /affiliates:#mall-ai-sales/);
});
