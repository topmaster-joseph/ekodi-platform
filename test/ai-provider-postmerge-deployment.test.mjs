import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
function section(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a);
  return source.slice(a,b);
}

test('provider capability runtime participates in guarded Control API deploy',()=>{
  const api=section('const controlApiTouched=','const marketingGrowthTouched=');
  assert.ok(api.includes("'ai-provider-control.js'"));
  assert.ok(api.includes("'scripts/converge-orchestrated-pr-merge.mjs'"));
  assert.ok(source.includes("if(controlApiTouched)"));
  assert.ok(source.includes("'deploy-control-api.yml'"));
});

test('provider admin UI participates in guarded Shared Site deploy',()=>{
  const site=section('const sharedSiteTouched=','async function dispatchPostMergeDeploys');
  assert.ok(site.includes("file==='admin-provider-control.js'"));
  assert.ok(site.includes("file==='ai-provider-control.js'"));
  assert.ok(source.includes("if(sharedSiteTouched)"));
  assert.ok(source.includes("'deploy-site-core.yml'"));
});

test('post-merge dispatch preserves orchestrator release receipt and checks',()=>{
  assert.ok(source.includes('release_branch_ref:branch,release_task_id:taskId'));
  assert.ok(source.includes('release receipt is not authorized'));
  assert.ok(source.includes("headStatuses.get(k)?.state!=='success'"));
});
