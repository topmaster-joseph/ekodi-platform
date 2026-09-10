import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const deploy=readFileSync('.github/workflows/deploy-marketing-pages.yml','utf8');
const sync=readFileSync('.github/workflows/sync-marketing-ai.yml','utf8');

test('Marketing AI has one recurring external-source sync controller',()=>{
  assert.match(deploy,/cron: '23 \* \* \* \*'/);
  assert.doesNotMatch(sync,/^\s*schedule:/m);
  assert.doesNotMatch(sync,/cron:/);
});

test('guarded fallback sync remains available without hourly polling',()=>{
  assert.match(sync,/workflow_dispatch:/);
  assert.match(sync,/push:/);
  assert.match(sync,/guarded-pages-release\.mjs/);
  assert.match(sync,/marketing-ai\.pages\.json/);
});

test('scheduled Marketing AI release probes identify as EKODI internal traffic',()=>{
  const markers=deploy.match(/EKODI-github-release\/1\.0/g)||[];
  assert.equal(markers.length,2);
});
