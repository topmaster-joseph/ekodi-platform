import test from 'node:test';
import assert from 'node:assert/strict';

import missionControl from '../mission-control-entry-worker.js';

test('Mission Control keeps Jubilee API dark when no mode is configured', async () => {
  const request = new Request('https://api.ekodi.kr/api/jubilee/v1/policy', { method: 'GET' });
  const response = await missionControl.fetch(request, {}, {});

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.code, 'JUBILEE_NOT_FOUND');
  assert.match(response.headers.get('strict-transport-security') || '', /max-age=/);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
});

test('Mission Control routes enabled Jubilee mode into capability authorization', async () => {
  const request = new Request('https://api.ekodi.kr/api/jubilee/v1/policy', { method: 'GET' });
  const response = await missionControl.fetch(request, { JUBILEE_API_MODE: 'shadow' }, {});

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.code, 'JUBILEE_FORBIDDEN');
  assert.equal(response.headers.get('x-ekodi-jubilee-mode'), 'shadow');
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
});
