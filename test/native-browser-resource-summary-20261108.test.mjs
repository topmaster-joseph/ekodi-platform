import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {collectSyntheticResourceSummary} from '../scripts/ekodi-background-browser-worker.mjs';

const worker=readFileSync(new URL('../scripts/ekodi-background-browser-worker.mjs',import.meta.url),'utf8');

function collect(entries,available=true){
  const context=available
    ? {performance:{getEntriesByType:type=>{assert.equal(type,'resource');return entries;}}}
    : {};
  return vm.runInNewContext('('+collectSyntheticResourceSummary.toString()+')()',context);
}

test('the native browser records bounded numeric resource categories without URLs or user state',()=>{
  const fixture=[
    {initiatorType:'script',duration:123.8,transferSize:2000,name:'https://ekodi.kr/private?token=SECRETA'},
    {initiatorType:'link',duration:35.4,transferSize:1500,name:'https://ekodi.kr/my/profile?email=private@example.org'},
    {initiatorType:'fetch',duration:450.5,transferSize:0,name:'https://api.example.org/private?secret=XYZ'},
    {initiatorType:'fetch',duration:20.1,transferSize:1200,name:'https://ekodi.kr/api/auth'},
    {initiatorType:'unrecognized-kind',duration:5,transferSize:0,name:'https://secret.example.com'},
  ];
  const x=collect(fixture);
  assert.equal(x.observedCount,5);
  assert.equal(x.truncated,false);
  assert.equal(x.initiatorCounts.script,1);
  assert.equal(x.initiatorCounts.link,1);
  assert.equal(x.initiatorCounts.fetch,2);
  assert.equal(x.initiatorCounts.other,1);
  assert.equal(x.slowestDurationMs,451);
  assert.equal(x.observedTransferKiB,5);
  assert.equal(x.transferSizeSamples,3);
  assert.doesNotMatch(JSON.stringify(x),/SECRETA|private@example\.org|XYZ|\/api\/auth|secret\.example/);
  assert.deepEqual(Object.keys(x).sort(),[
    'initiatorCounts','observedCount','observedTransferKiB',
    'slowestDurationMs','transferSizeSamples','truncated',
  ]);
});

test('unsupported resource timing remains null rather than invented zero',()=>{
  assert.equal(collect(null,false),null);
  assert.equal(collect(null),null);
  const empty=collect([]);
  assert.equal(empty.observedCount,0);
  assert.equal(empty.slowestDurationMs,null);
  assert.equal(empty.observedTransferKiB,null);
});

test('large navigation samples are capped, counted and signaled as truncated',()=>{
  const rows=Array.from({length:801},(_,i)=>({
    initiatorType:i%2?'script':'img',duration:i,transferSize:1024,
  }));
  const x=collect(rows);
  assert.equal(x.observedCount,500);
  assert.equal(x.truncated,true);
  assert.equal(x.initiatorCounts.script,250);
  assert.equal(x.initiatorCounts.img,250);
  assert.equal(x.slowestDurationMs,499);
  assert.equal(x.observedTransferKiB,500);
});

test('native timing reports expose synthetic-only resource summary, never names',()=>{
  assert.match(worker,/page\.evaluate\(collectSyntheticResourceSummary\)/);
  assert.match(worker,/resourceSummary,attempts:attempt\+1,status/);
  assert.doesNotMatch(collectSyntheticResourceSummary.toString(),/\.name\b|\.url\b|fetch\(|sendBeacon|localStorage|sessionStorage|document\.querySelector/);
  assert.match(worker,/CF_QUOTA_CIRCUIT_OPEN/);
  assert.match(worker,/minimumGap=2200/);
});
