import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20261103213000_ekodi_points_recognition_goals_person_idx.sql',import.meta.url),'utf8');
const smoke=readFileSync(new URL('points-recognition-goals-isolated-smoke.sql',import.meta.url),'utf8');

test('recognition goals have a canonical-Person-leading FK index',()=>{
  assert.match(migration,/create index if not exists ekodi_point_recognition_goals_person_idx/);
  assert.match(migration,/on ekodi_points_private\.member_recognition_goals \(person_id\)/);
  assert.match(smoke,/indexname='ekodi_point_recognition_goals_person_idx'/);
  assert.doesNotMatch(migration,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/i);
  assert.doesNotMatch(migration,/\bGRANT\b|\bREVOKE\b|\bDROP\b|\bTRUNCATE\b/i);
});
