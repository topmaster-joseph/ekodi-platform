import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('notification static assets dispatch receipt-bound Shared Site release',async()=>{
  const [converger,workflow,build,site]=await Promise.all([
    read('scripts/converge-orchestrated-pr-merge.mjs'),
    read('.github/workflows/deploy-site-core.yml'),
    read('scripts/build.mjs'),
    read('wrangler.site.toml')
  ]);
  const start=converger.indexOf('const sharedSiteTouched=');
  assert.ok(start>=0,'sharedSiteTouched selector missing');
  const touched=converger.slice(start,start+8000);
  assert.match(touched,/file\.startsWith\('notifications\/'\)/,'notification UI changes must trigger shared site');
  assert.match(converger,/if\(sharedSiteTouched\)\{[\s\S]*?deploy-site-core\.yml\/dispatches/);
  const push=workflow.slice(workflow.indexOf('  push:'),workflow.indexOf('\npermissions:'));
  assert.ok(push.includes("'notifications/**'"),'main push must watch notification static assets');
  assert.match(build,/cp\(.+notifications.+output.+notifications.+recursive: true/s);
  assert.match(site,/directory = "\.\/dist"/);
  assert.match(workflow,/scripts\/guarded-worker-release\.mjs/);
});

test('notification server changes dispatch canonical Control API',async()=>{
  const [converger,workflow,api]=await Promise.all([
    read('scripts/converge-orchestrated-pr-merge.mjs'),
    read('.github/workflows/deploy-control-api.yml'),
    read('mission-control-entry-worker.js')
  ]);
  const touched=converger.slice(converger.indexOf('const controlApiTouched='),converger.indexOf('const marketingGrowthTouched='));
  for(const name of ['notification-control.js','notification-webpush.js']){
    assert.ok(touched.includes("'"+name+"'"),'post-merge API dispatcher excludes '+name);
    assert.equal(workflow.split("'"+name+"'").length-1,2,'PR and push paths must watch '+name);
  }
  assert.match(api,/from '\.\/notification-control\.js'/);
  assert.match(converger,/if\(controlApiTouched\)[\s\S]*?deploy-control-api\.yml\/dispatches/);
});

test('immediate recovery merge uses exactly the same notification release owners',async()=>{
  const recovery=await read('scripts/recover-release-provenance.mjs');
  const shared=recovery.slice(recovery.indexOf('const sharedSiteTouched='),recovery.indexOf('const shellRuntimeTouched='));
  assert.match(shared,/file\.startsWith\('notifications\/'\)/);
  const api=recovery.slice(recovery.indexOf('const controlApiTouched='),recovery.indexOf('const sharedSiteTouched='));
  for(const file of ['notification-control.js','notification-webpush.js'])
    assert.ok(api.includes("'"+file+"'"),'immediate Control API release missed '+file);
  assert.match(recovery,/if\(sharedSiteTouched\)[\s\S]*?deploy-site-core\.yml\/dispatches/);
  assert.match(recovery,/if\(controlApiTouched\)[\s\S]*?deploy-control-api\.yml\/dispatches/);
});
