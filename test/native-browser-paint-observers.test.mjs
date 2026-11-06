import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {installSyntheticPaintObservers} from '../scripts/ekodi-background-browser-worker.mjs';

function probe(supported=['largest-contentful-paint','layout-shift']){
  const callbacks=new Map();
  class Observer{
    static supportedEntryTypes=supported;
    constructor(callback){this.callback=callback;}
    observe({type,buffered}){
      assert.equal(buffered,true);
      callbacks.set(type,this.callback);
    }
  }
  const window={};
  vm.runInNewContext('('+installSyntheticPaintObservers.toString()+')()', {window,PerformanceObserver:Observer});
  return {metrics:window.__EKODI_SYNTHETIC_PAINT__,callbacks};
}

test('captures numeric-only early LCP candidate, not a final LCP claim',()=>{
  const {metrics,callbacks}=probe();
  assert.equal(metrics.lcpCandidateMs,null);
  callbacks.get('largest-contentful-paint')({getEntries:()=>[
    {startTime:1044.6,element:{privateData:'must-not-capture'}},
    {startTime:1600.2,url:'https://ekodi.kr/private?token=secret'},
  ]});
  assert.equal(metrics.lcpCandidateMs,1600);
  assert.deepEqual(Object.keys(metrics).sort(),['layoutShiftSumToSettle','lcpCandidateMs']);
});

test('sums only layout shifts without recent input, not page-lifetime CLS',()=>{
  const {metrics,callbacks}=probe();
  callbacks.get('layout-shift')({getEntries:()=>[
    {value:0.035,hadRecentInput:false},
    {value:0.9,hadRecentInput:true},
    {value:0.031,hadRecentInput:false},
  ]});
  assert.equal(metrics.layoutShiftSumToSettle,0.066);
});

test('unsupported metrics remain null, not fabricated zero',()=>{
  const {metrics,callbacks}=probe([]);
  assert.equal(metrics.lcpCandidateMs,null);
  assert.equal(metrics.layoutShiftSumToSettle,null);
  assert.equal(callbacks.size,0);
});

test('one observer type can be supported without the other',()=>{
  const {metrics,callbacks}=probe(['layout-shift']);
  assert.equal(metrics.lcpCandidateMs,null);
  assert.equal(metrics.layoutShiftSumToSettle,0);
  assert.equal(callbacks.has('largest-contentful-paint'),false);
});

test('browser worker captures metrics before page loads but only reports numbers',()=>{
  const worker=readFileSync(new URL('../scripts/ekodi-background-browser-worker.mjs',import.meta.url),'utf8');
  assert.match(worker,/await page\.addInitScript\(installSyntheticPaintObservers\)/);
  assert.match(worker,/lcpCandidateMs:browserTiming\.lcpCandidateMs/);
  assert.match(worker,/layoutShiftSumToSettle:browserTiming\.layoutShiftSumToSettle/);
  assert.match(worker,/lcpCandidateMs:null,layoutShiftSumToSettle:null/);
  assert.doesNotMatch(installSyntheticPaintObservers.toString(),/fetch\(|sendBeacon|localStorage|sessionStorage|document\.querySelector|innerText|cookie/i);
});
