import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVOTIONAL_SEPTEMBER_2026, handleDevotionalControl } from '../devotional-control.js';

test('September 2026 devotional plan contains 30 ordered passages', () => {
  assert.equal(DEVOTIONAL_SEPTEMBER_2026.length, 30);
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[0], '신명기 14:22-29');
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[18], '신명기 23:1-8');
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[19], '신명기 23:9-14');
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[21], '신명기 24:1-13');
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[29], '신명기 28:1-14');
});

test('devotional control ignores unrelated routes before authentication', async () => {
  const response = await handleDevotionalControl(new Request('https://api.ekodi.kr/api/other'), {}, {});
  assert.equal(response, null);
});