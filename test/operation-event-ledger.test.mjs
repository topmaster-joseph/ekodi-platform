import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const writer = path.resolve('scripts/write-operation-event.mjs');
function run(event) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-event-'));
  const file = path.join(dir, 'event.json');
  fs.writeFileSync(file, JSON.stringify(event));
  return spawnSync(process.execPath, [writer, file], { cwd: process.cwd(), encoding: 'utf8' });
}
const base = {schema:'ekodi.operation-event/v1',event_id:`test-${Date.now()}`,event_type:'production_verified',occurred_at:new Date().toISOString(),service:'ekodi.kr/health',environment:'production',source:'ekodi-orchestrator',summary:'E2E contract test',verification:{status:'passed',checks:['health'],evidence:['synthetic-test-evidence']},severity:'info',requires_human:false};

test('production_verified requires evidence', () => {
  const result = run({...base,event_id:`no-evidence-${Date.now()}`,verification:{status:'passed',checks:['health'],evidence:[]}});
  assert.notEqual(result.status, 0);
});

test('writer rejects sensitive material', () => {
  const result = run({...base,event_id:`secret-${Date.now()}`,summary:'authorization: bearer secret'});
  assert.notEqual(result.status, 0);
});

test('valid provider-neutral event writes', () => {
  const event = {...base,event_id:`valid-${Date.now()}-${Math.random().toString(36).slice(2)}`};
  const result = run(event);
  assert.equal(result.status, 0, result.stderr);
  const ledger = path.resolve('ops/events/ledger', `${event.event_id}.json`);
  assert.equal(JSON.parse(fs.readFileSync(ledger,'utf8')).source, 'ekodi-orchestrator');
  fs.unlinkSync(ledger);
});
