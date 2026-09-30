import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import platformRouter from '../platform-router-entry-worker.js';

const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/space.worker.json', import.meta.url), 'utf8'));
const requests = new Map(manifest.worker.requests.map(item => [item.url, item]));

test('Mission LIVE release gate belongs to Shared Site, not Operating Space', async () => {
  assert.equal(requests.has('https://ekodi.kr/ekodimission/live'), false);

  const response = await platformRouter.fetch(
    new Request('https://ekodi.kr/ekodimission/live'),
    {},
    { waitUntil() {} },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-ekodi-route'), 'ekodimission-public');
  assert.equal(response.headers.get('x-ekodi-independent-site'), 'true');
  assert.equal(response.headers.get('x-ekodi-publication-status'), 'published');
  assert.equal(response.headers.get('x-robots-tag'), 'index, follow');
  assert.match(await response.text(), /EKODI REALTIME/);
});

test('hammu candidate-only marker is not required from the previous stable rollback', () => {
  const hammu = requests.get('https://ekodi.kr/hammu');
  assert.ok(hammu);
  assert.equal(hammu.rollbackVerify, false);
});
