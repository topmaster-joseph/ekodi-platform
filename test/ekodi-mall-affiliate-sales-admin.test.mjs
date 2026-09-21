import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('affiliate hubs identify direct and network merchant fields', async () => {
  const source = await read('sites/ekodi-mall/assets/affiliate-hub.js');
  assert.match(source, /item\.merchantKey/);
  assert.match(source, /item\.merchantName/);
  assert.match(source, /noopener sponsored/);
});

test('Mall admin explains affiliate source controls and automatic sales status surfaces', async () => {
  const source = await read('workspace-admin-page.js');
  assert.match(source, /아고다와 쿠팡 파트너스/);
  assert.match(source, /아고다 · 쿠팡 자동영업 설정/);
  assert.match(source, /판매처별 적용 상태는 공급·제휴에서/);
  assert.match(source, /최근 자동영업 활동/);
  assert.match(source, /오늘 자동게시/);
});
