import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('trade admin separates supply routes from sales markets', async () => {
  const src = await readFile(new URL('../workspace-trade-admin-page.js', import.meta.url), 'utf8');
  assert.match(src,/\['supply','공급관리'\]/);
  assert.match(src,/\['sales','판매시장'\]/);
  assert.match(src,/trade_supply_routes/);
  assert.match(src,/trade_sales_markets/);
  assert.match(src,/공급국과 판매국을 묶지 않습니다/);
  assert.match(src,/공급국과 판매국은 독립 관리됩니다/);
});