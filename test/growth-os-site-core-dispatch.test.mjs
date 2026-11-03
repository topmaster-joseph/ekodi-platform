import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Growth OS central and tenant assets dispatch their shared Site Core release',()=>{
  const source=read('scripts/converge-orchestrated-pr-merge.mjs');
  const start=source.indexOf('const sharedSiteTouched=changedFiles.some(file=>');
  const stop=source.indexOf('// Church public Pages',start);
  assert.ok(start>=0&&stop>start,'guarded Site Core trigger table must remain present');
  const trigger=source.slice(start,stop);
  for(const asset of [
    'growth-os-admin.js','growth-os-admin.css',
    'tenant-automation-overview-ui.js','scripts/validate-admin-source.mjs'
  ]) assert.ok(trigger.includes("'"+asset+"'"),asset+' must dispatch Site Core');
  assert.match(source,/deploy-site-core\.yml/);
});

test('Growth OS script is a real Site Core asset and its direct admin route is stable',()=>{
  const build=read('scripts/build.mjs');
  const worker=read('site-worker.js');
  const loader=read('admin-demand-loader.js');
  for(const asset of ['growth-os-admin.js','growth-os-admin.css']){
    assert.ok(build.includes("'"+asset+"'"));
    assert.ok(worker.includes("'\/"+asset+"'"));
    assert.ok(loader.includes("'"+asset+"'"));
  }
  assert.ok(loader.includes("'/admin/ai/growth-os'"));
});
