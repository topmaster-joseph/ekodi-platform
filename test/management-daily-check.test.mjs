import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEMS,CHANGE_IDS,blankRecord,sanitizeRecord,evaluate,csvForRecord} from '../management/daily-check/model.js';
test('daily compliance checklist separates self-check from legal filing',()=>{
  assert.ok(ITEMS.length>=12);
  assert.ok(CHANGE_IDS.has('area'));
  const record=blankRecord('테스트 매장','2026-11-12');
  assert.equal(evaluate(record).checked,0);
  assert.equal(evaluate(record).canComplete,false);
  record.rows.area={status:'issue',note:''};
  for(const i of ITEMS)if(i.id!=='area')record.rows[i.id]={status:'ok',note:''};
  assert.deepEqual(evaluate(record).changeIssues.map(i=>i.id),['area']);
  assert.equal(evaluate(record).canComplete,false);
  record.rows.area.note='관할 행정기관 확인';
  assert.equal(evaluate(record).canComplete,true);
});
test('version, date and business boundaries fail closed',()=>{
  const record=blankRecord('가게A','2026-11-12');
  record.rows.area.status='issue';
  assert.equal(sanitizeRecord(record,'가게B','2026-11-12').rows.area.status,'');
  assert.equal(sanitizeRecord(record,'가게A','2026-11-13').rows.area.status,'');
  assert.equal(sanitizeRecord({...record,version:'old'},'가게A','2026-11-12').rows.area.status,'');
});
test('CSV export protects spreadsheet formula injection',()=>{
  const record=blankRecord('=DANGEROUS()','2026-11-12');
  record.rows.area={status:'issue',note:'=1+1'};
  const csv=csvForRecord(record);
  assert.match(csv,/"'=DANGEROUS\(\)"/);
  assert.match(csv,/"'=1\+1"/);
  assert.ok(csv.startsWith('\uFEFF'));
});
