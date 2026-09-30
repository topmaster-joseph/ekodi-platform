import test from 'node:test';
import assert from 'node:assert/strict';
import { INDEXNOW_KEY } from '../scripts/discovery-build.mjs';

test('IndexNow key is valid for public search notification', () => {
  assert.match(INDEXNOW_KEY, /^[A-Za-z0-9-]{8,128}$/);
});
