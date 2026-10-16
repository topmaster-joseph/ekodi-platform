import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../control-tower-admin.js', import.meta.url),'utf8');
const start = source.indexOf('  function githubRunSnapshot(');
const end = source.indexOf('  function navigate(',start);
assert.ok(start !== -1 && end > start,'GitHub summary must be a pure local function');
const summarize = new Function(source.slice(start,end)+'\nreturn githubRunSnapshot;')();

test('GitHub data unavailable is unknown, not healthy zero',()=>{
  const result = summarize(null);
  assert.equal(result.available,false);
  assert.equal(result.sampled,0);
});

test('GitHub summary tracks only sampled runs and never pretends to bill',()=>{
  const result=summarize({reportedTotal:1000,all:[
    {status:'completed',conclusion:'success'},
    {status:'completed',conclusion:'failure'},
    {status:'completed',conclusion:'cancelled'},
    {status:'in_progress',conclusion:null},
    {status:'queued',conclusion:null},
    {status:'completed',conclusion:'skipped'},
  ]});
  assert.equal(result.available,true);
  assert.equal(result.sampled,6);
  assert.equal(result.reportedTotal,1000);
  assert.equal(result.failed,2);
  assert.equal(result.active,2);
  assert.equal(result.skipped,1);
  assert.ok(!('costUsd' in result));
});

test('existing public Actions fetch does not add browser credentials',()=>{
  assert.match(source,/const RUNS_URL =/);
  assert.match(source,/cache:'no-store',\s*headers:\{ accept:'application\/vnd\.github\+json'/);
  assert.match(source,/GitHub 실행 기록을 확인할 수 없습니다/);
});
