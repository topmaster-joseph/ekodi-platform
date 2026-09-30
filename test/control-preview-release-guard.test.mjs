import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(
  new URL('../deploy/manifests/control-api.worker.json', import.meta.url),
  'utf8',
));

function requestFor(url) {
  return manifest.worker.requests.find(request => request.url === url);
}

test('Control public preview smoke-tests the candidate through the canonical service binding', () => {
  const request = requestFor('https://ekodi.kr/api/public/preview/map?scope=ekodi&mode=platform');
  assert.ok(request);
  assert.equal(request.candidateUrl, undefined);
  assert.deepEqual(request.candidateStatuses, [200]);
  assert.ok(request.candidateExpect.includes('"schemaVersion":1'));
  assert.ok(request.candidateHeaderExpect.includes('cache-control: public'));
  assert.ok(request.candidateHeaderExpect.includes('x-content-type-options: nosniff'));
  assert.equal(request.rollbackVerify, false);
});

test('Control public preview keeps canonical post-promotion cache and privacy verification', () => {
  const request = requestFor('https://ekodi.kr/api/public/preview/map?scope=ekodi&mode=platform');
  assert.ok(request.expect.includes('"secrets":false'));
  assert.ok(request.expect.includes('"personalData":false'));
  assert.ok(request.headerExpect.includes('cache-control: public'));
  assert.ok(request.headerExpect.includes('x-content-type-options: nosniff'));
});
