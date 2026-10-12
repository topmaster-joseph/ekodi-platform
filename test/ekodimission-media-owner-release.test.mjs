import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/mission-media-security-issue-dispatch.yml',import.meta.url),'utf8');

test('owner issue label can only request existing guarded EKODI Mission security release',()=>{
  assert.match(workflow,/issues:\s*\n\s*types:\s*\[labeled\]/);
  assert.match(workflow,/github\.event\.issue\.number == 4265/);
  assert.match(workflow,/github\.event\.issue\.state == 'open'/);
  assert.match(workflow,/github\.event\.issue\.user\.login == 'topmaster-joseph'/);
  assert.match(workflow,/github\.actor == 'topmaster-joseph'/);
  assert.match(workflow,/github\.event\.label\.name == 'ekodi-mission-media-security-release'/);
  assert.match(workflow,/pulls\/4336/);
  assert.match(workflow,/pulls\/4361/);
  assert.match(workflow,/\.merged == true/);
  assert.match(workflow,/release-receipt/);
  assert.match(workflow,/\.authorized == true/);
  assert.match(workflow,/reviewed_sha/);
  assert.match(workflow,/main_sha/);
  assert.match(workflow,/\[ "\$reviewed_sha" = "\$main_sha" \]/);
  assert.match(workflow,/reconcile-mission-media-moderation-release\.yml\/dispatches/);
  assert.match(workflow,/inputs\[release_branch_ref\]/);
  assert.match(workflow,/inputs\[release_task_id\]/);
  assert.doesNotMatch(workflow,/\bapply_migration\b|\bdatabase\/query\b|supabase\.com\/v1\/projects/);
});

test('native Mission owner dispatcher never holds deployment credentials',()=>{
  assert.match(workflow,/GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow,/SUPABASE_ACCESS_TOKEN|SUPABASE_PAT|CLOUDFLARE_API_TOKEN/);
  assert.match(workflow,/cancel-in-progress: false/);
});
