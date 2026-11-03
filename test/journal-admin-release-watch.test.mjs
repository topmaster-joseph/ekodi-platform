import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const adminAssets=['journal-editorial-admin.js','journal-editorial-packet.js'];
const watcherTest='test/journal-admin-release-watch.test.mjs';
const count=(text,fragment)=>text.split(fragment).length-1;

test('Journal editor assets and regression cases trigger the actual protected shared-site release',()=>{
  const workflow=read('.github/workflows/deploy-site-core.yml');
  for(const asset of adminAssets){
    assert.equal(count(workflow,"- '"+asset+"'"),2,asset+' must cover push and PR path scopes');
    assert.ok(workflow.includes('dist/'+asset));
    assert.ok(workflow.includes('dist/admin/'+asset));
  }
  assert.equal(count(workflow,"- 'test/journal-editorial-review.test.mjs'"),2);
  assert.equal(count(workflow,"- '"+watcherTest+"'"),2);
  assert.match(workflow,/node scripts\/guarded-worker-release\.mjs/);
  assert.match(workflow,/EKODI Native Surface Verification/);
});

test('Journal private editor changes are included in Development-only Admin staging checks',()=>{
  const workflow=read('.github/workflows/deploy-admin-staging.yml');
  for(const asset of adminAssets){
    assert.equal(count(workflow,"- '"+asset+"'"),1);
    assert.ok(workflow.includes('node --check '+asset));
  }
  assert.ok(workflow.includes("- '"+watcherTest+"'"));
  assert.match(workflow,/wrangler\.admin\.staging\.toml/);
});
