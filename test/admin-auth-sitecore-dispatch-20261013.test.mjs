import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
const deploy=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');

test('Admin central login handoff triggers receipt-bound post-merge Site Core deploy',()=>{
  const begin=source.indexOf('const sharedSiteTouched=');
  const end=source.indexOf('const churchPagesTouched=',begin);
  assert.ok(begin>=0&&end>begin,'Site Core release target selector must be present');
  const selector=source.slice(begin,end);
  assert.ok(selector.includes("file==='admin-central-handoff.js'"));
  assert.ok(source.includes("if(sharedSiteTouched){"));
  assert.ok(source.includes("release_branch_ref:branch,release_task_id:taskId"));
  assert.ok(deploy.includes("- 'admin-central-handoff.js'"));
});
