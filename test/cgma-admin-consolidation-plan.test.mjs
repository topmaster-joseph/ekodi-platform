
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plan=readFileSync(new URL('../docs/CGMA-ADMIN-CONSOLIDATION-20261102.md',import.meta.url),'utf8');

test('CGMA migration preserves separate public and admin canonical routes',()=>{
  assert.ok(plan.includes('https://ekodi.kr/cgma/admin'));
  assert.ok(plan.includes('https://cgma.or.kr'));
  assert.match(plan,/Redirect \/admin itself \*\*last\*\*/);
});
test('CGMA migration inventory covers all legacy admin duties and data authorities',()=>{
  for(const term of [
    'Member application approvals','Festival booth selection','Merchant operations and control tower',
    'Parking petition/consent','Intellectual property archive','Language publishing',
    'AI education surveys','Merchant directory + resource management',
    'Supabase','D1','Google Sheets','tenant'
  ]) assert.ok(plan.includes(term),term);
});
test('Migration release is guarded against permission expansion and premature cutover',()=>{
  for(const term of ['No change to tenant IDs','without destructive production writes','Rollback','no duplicate data copies']) {
    assert.match(plan,new RegExp(term,'i'),term);
  }
});
