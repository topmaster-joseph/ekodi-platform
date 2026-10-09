import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
function section(start,end){const a=src.indexOf(start),b=src.indexOf(end,a);assert.ok(a>=0&&b>a);return src.slice(a,b)}

test('provider capability runtime participates in guarded Control API deploy',()=>{
  const api=section('const controlApiTouched=','const marketingGrowthTouched=');
  assert.match(api,/'ai-provider-control\\.js'/);
  assert.match(api,/'scripts\\/converge-orchestrated-pr-merge\\.mjs'/);
  assert.match(src,/if\\(controlApiTouched\\)[\\s\\S]*'deploy-control-api\\.yml'/);
});

test('provider admin UI participates in guarded Shared Site deploy',()=>{
  const site=section('const sharedSiteTouched=','async function dispatchPostMergeDeploys');
  assert.match(site,/admin-provider-control\\.js/);
  assert.match(site,/ai-provider-control\\.js/);
  assert.match(src,/if\\(sharedSiteTouched\\)[\\s\\S]*'deploy-site-core\\.yml'/);
});

test('post-merge deploy dispatch preserves verified release branch and task',()=>{
  assert.match(src,/release_branch_ref:branch,release_task_id:taskId/);
  assert.match(src,/release receipt is not authorized/);
  assert.match(src,/headStatuses.get\\(k\\)\\?\\.state!=='success'/);
});
