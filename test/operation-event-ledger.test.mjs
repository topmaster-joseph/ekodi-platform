import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const writer=path.resolve('scripts/write-operation-event.mjs');
function eventFile(event){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ekodi-event-'));const file=path.resolve(dir,'event.json');fs.writeFileSync(file,JSON.stringify(event));return{dir,file}}
function run(event){const{dir,file}=eventFile(event);return spawnSync(process.execPath,[writer,file],{cwd:dir,encoding:'utf8'})}
const base={schema:'ekodi.operation-event/v1',event_id:`test-${Date.now()}`,event_type:'production_verified',occurred_at:new Date().toISOString(),service:'ekodi.kr/health',environment:'production',source:'ekodi-orchestrator',summary:'E2E contract test',verification:{status:'passed',checks:['health'],evidence:['synthetic-test-evidence']},severity:'info',requires_human:false};
test('production_verified requires evidence',()=>{const r=run({...base,event_id:`no-evidence-${Date.now()}`,verification:{status:'passed',checks:['health'],evidence:[]}});assert.notEqual(r.status,0)});
test('writer rejects sensitive material',()=>{const r=run({...base,event_id:`secret-${Date.now()}`,summary:'authorization: bearer secret'});assert.notEqual(r.status,0)});
test('valid provider-neutral event writes',()=>{const event={...base,event_id:`valid-${Date.now()}-${Math.random().toString(36).slice(2)}`};const{dir,file}=eventFile(event);const r=spawnSync(process.execPath,[writer,file],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);const ledger=path.join(dir,'ops/events/ledger',`${event.event_id}.json`);assert.equal(JSON.parse(fs.readFileSync(ledger,'utf8')).source,'ekodi-orchestrator')});
