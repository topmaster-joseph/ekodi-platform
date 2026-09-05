import test from 'node:test';
import assert from 'node:assert/strict';
import {EKODI_SEPTEMBER_2026,buildEkodiSeptemberBatch} from '../../../integrations/devotion-studio/ekodi-september-2026.js';

test('EKODI September integration keeps the final 30-day source plan',()=>{
  assert.equal(EKODI_SEPTEMBER_2026.length,30);
  assert.equal(EKODI_SEPTEMBER_2026[18],'신명기 23:1-8');
  assert.equal(EKODI_SEPTEMBER_2026[19],'신명기 23:9-14');
  assert.equal(EKODI_SEPTEMBER_2026[20],'신명기 23:15-25');
  assert.equal(EKODI_SEPTEMBER_2026[21],'신명기 24:1-13');
  assert.equal(EKODI_SEPTEMBER_2026[22],'신명기 24:14-22');
  assert.equal(EKODI_SEPTEMBER_2026[23],'신명기 25:1-12');
  assert.equal(EKODI_SEPTEMBER_2026[24],'신명기 25:13-19');
  assert.equal(EKODI_SEPTEMBER_2026[29],'신명기 28:1-14');
});

test('Church and Mission packaging stays in the integration layer',()=>{
  const batch=buildEkodiSeptemberBatch({workspaceId:'workspace-test',churchTargetRef:'church-ref',missionTargetRef:'mission-ref'});
  assert.deepEqual(batch.publication_targets.map(target=>target.id),['church','mission']);
  assert.equal(batch.items.length,30);
  assert.match(batch.items[0].metadata.editorial_guidance,/공동체/);
  assert.equal(batch.items[0].metadata.duration_seconds,30);
});
