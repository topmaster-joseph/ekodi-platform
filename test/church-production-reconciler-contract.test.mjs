import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Church production release publishes and verifies source revision',async()=>{
  const deploy=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(deploy,/CHURCH_SOURCE_SHA=\$\(git -C church rev-parse HEAD\)/);
  assert.match(deploy,/church-release\.json/);
  assert.match(deploy,/ekodi\.church-release\.v1/);
  assert.match(deploy,/process\.env\.CHURCH_SOURCE_SHA/);
  assert.match(deploy,/sourceSha == \$sha/);
});

test('Church reconciler stays central and uses no cross-repository secret',async()=>{
  const workflow=await read('.github/workflows/reconcile-ekodi-church-homepage.yml');
  assert.match(workflow,/cron: '17 \* \* \* \*'/);
  assert.match(workflow,/actions: write/);
  assert.match(workflow,/git ls-remote https:\/\/github\.com\/topmaster-joseph\/ekodi-church\.git refs\/heads\/main/);
  assert.match(workflow,/https:\/\/church\.ekodi\.kr\/church-release\.json/);
  assert.match(workflow,/gh workflow run deploy-ekodi-church-homepage\.yml/);
  assert.match(workflow,/GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow,/PAT|PERSONAL_ACCESS|CLOUDFLARE_API_TOKEN/);
});
