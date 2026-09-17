import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/space.worker.json', import.meta.url), 'utf8'));
const requests = new Map(manifest.worker.requests.map(item => [item.url, item]));

test('Mission LIVE release gate expects canonical public indexing header', () => {
  const live = requests.get('https://ekodi.kr/ekodimission/live');
  assert.ok(live);
  assert.ok(live.headerExpect.includes('x-robots-tag: index, follow'));
  assert.equal(live.rollbackVerify, false);
});

test('hammu candidate-only marker is not required from the previous stable rollback', () => {
  const hammu = requests.get('https://ekodi.kr/hammu');
  assert.ok(hammu);
  assert.equal(hammu.rollbackVerify, false);
});
