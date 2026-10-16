import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('post-Shell education production browser proof never mutates or bypasses guarded release',async()=>{
  const [workflow,classroom,studio]=await Promise.all([
    read('.github/workflows/verify-education-after-shell-native.yml'),
    read('scripts/verify-education-bootcamp-native.mjs'),
    read('scripts/verify-education-material-studio-native.mjs')
  ]);
  assert.match(workflow,/workflows: \["Deploy EKODI Shell"\]/);
  assert.match(workflow,/github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow,/github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/ref: main/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/run: node scripts\/verify-education-bootcamp-native\.mjs/);
  assert.match(workflow,/run: node scripts\/verify-education-material-studio-native\.mjs/);
  assert.match(workflow,/artifacts\/education-native\//);
  assert.match(workflow,/artifacts\/education-studio-native\//);
  assert.doesNotMatch(workflow,/wrangler\s+(deploy|triggers)/);
  assert.doesNotMatch(workflow,/bypassCSP|ignoreHTTPSErrors|CLOUDFLARE_API_TOKEN|workflow_run\.conclusion\s*!=/);
  for(const source of [classroom,studio]){
    assert.match(source,/verifyKnownSecurityBlocks/);
    assert.match(source,/classifyMutationSecurityBlock/);
    assert.match(source,/chromium\.launch\(\{headless:true\}\)/);
    assert.doesNotMatch(source,/launchPersistentContext|connectOverCDP|bypassCSP:\s*true/);
  }
});
