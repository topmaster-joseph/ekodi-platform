import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const dispatcher=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');

test('AI membership panel edits dispatch guarded Shared Site Core deployment',()=>{
  const start=dispatcher.indexOf('const sharedSiteTouched=');
  const end=dispatcher.indexOf('const churchPagesTouched=',start);
  assert.ok(start>=0&&end>start);
  const selector=dispatcher.slice(start,end);
  assert.ok(selector.includes("file==='user-ai-tier-panel.js'||"));
  assert.ok(selector.includes("file==='admin-provider-control.js'||"));
  assert.ok(!selector.includes("file==='test/ai-membership-release-dispatch.test.mjs'"));
  assert.ok(dispatcher.includes('if(sharedSiteTouched)'));
  assert.ok(dispatcher.includes("'deploy-site-core.yml'"));
});

test('membership UI does not trigger the Control API worker unnecessarily',()=>{
  const start=dispatcher.indexOf('const controlApiTouched=');
  const end=dispatcher.indexOf('const marketingGrowthTouched=',start);
  assert.ok(start>=0&&end>start);
  assert.ok(!dispatcher.slice(start,end).includes("file==='user-ai-tier-panel.js'"));
});

test('AI membership panel is included in administrator bundle build',()=>{
  assert.ok(build.includes('user-ai-tier-panel.js'));
  assert.ok(build.includes('ai-ops-admin.js'));
});

test('guarded site dispatch preserves exact orchestrator provenance',()=>{
  assert.ok(dispatcher.includes('release_branch_ref:branch,release_task_id:taskId'));
  assert.ok(dispatcher.includes('release receipt is not authorized'));
});
