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
  assert.match(source, /플랫폼 공통 판매·공급망 엔진에 등록된 Provider/);
  assert.match(source, /아고다 · 쿠팡 자동영업 설정/);
  assert.match(source, /여기의 ON\/OFF는 플랫폼 연동 자체가 아니라 에코디몰 사용 여부/);
  assert.match(source, /자동게시 채널·일일 한도는 자동운영에서 관리/);
  assert.match(source, /최근 자동영업 활동/);
  assert.match(source, /오늘 자동게시/);
});
