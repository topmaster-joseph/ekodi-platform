import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEVOTIONAL_SEPTEMBER_2026, handleDevotionalControl } from '../devotional-control.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('September 2026 devotional plan contains the final 30 ordered passages', () => {
  assert.equal(DEVOTIONAL_SEPTEMBER_2026.length, 30);
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[0], '신명기 14:22-29');
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[18], '신명기 23:1-14');
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[19], '신명기 23:15-25');
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[20], '신명기 24:1-9');
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[23], '신명기 25:11-19');
  assert.equal(DEVOTIONAL_SEPTEMBER_2026[29], '신명기 28:15-26');
});

test('platform devotional control is a service adapter, not the devotional engine', async () => {
  const source = await read('devotional-control.js');
  assert.match(source, /DEVOTION_STUDIO_ENDPOINT/);
  assert.match(source, /DEVOTION_STUDIO_WORKSPACE_ID/);
  assert.match(source, /\/v1\/batches\//);
  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS devotional_/);
  assert.doesNotMatch(source, /DEVOTIONAL_RENDER_ENDPOINT/);
  assert.doesNotMatch(source, /EKODI_SHARED_DRIVE/);
});

test('independent service core contains no church or mission organization assumptions', async () => {
  const source = await read('services/devotion-studio/src/service.js');
  assert.doesNotMatch(source, /에코디교회|에코디선교회/);
  assert.doesNotMatch(source, /auth-worker|Cloudflare|D1|youtube_channel_id/i);
  assert.match(source, /workspace_id/);
  assert.match(source, /publication_targets/);
});

test('devotional control ignores unrelated routes before authentication', async () => {
  const response = await handleDevotionalControl(new Request('https://api.ekodi.kr/api/other'), {}, {});
  assert.equal(response, null);
});
