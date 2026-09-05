import test from 'node:test';
import assert from 'node:assert/strict';
import {EKODI_SEPTEMBER_2026,buildEkodiSeptemberBatch} from '../../../integrations/devotion-studio/ekodi-september-2026.js';

test('EKODI September integration keeps the final 30-day source plan',()=>{
  assert.equal(EKODI_SEPTEMBER_2026.length,30);
  assert.equal(EKODI_SEPTEMBER_2026[18],'신명기 23:1-14');
  assert.equal(EKODI_SEPTEMBER_2026[19],'신명기 23:15-25');
  assert.equal(EKODI_SEPTEMBER_2026[20],'신명기 24:1-9');
  assert.equal(EKODI_SEPTEMBER_2026[21],'신명기 24:10-22');
  assert.equal(EKODI_SEPTEMBER_2026[22],'신명기 25:1-10');
  assert.equal(EKODI_SEPTEMBER_2026[23],'신명기 25:11-19');
  assert.equal(EKODI_SEPTEMBER_2026[29],'신명기 28:15-26');
});

test('Church and Mission packaging stays in the integration layer',()=>{
  const batch=buildEkodiSeptemberBatch({workspaceId:'workspace-test',churchTargetRef:'church-ref',missionTargetRef:'mission-ref'});
  assert.deepEqual(batch.publication_targets.map(target=>target.id),['church','mission']);
  assert.equal(batch.items.length,30);
});
