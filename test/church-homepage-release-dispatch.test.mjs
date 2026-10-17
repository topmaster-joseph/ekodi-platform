import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Church Pages guarded workflow requires exact EKODI release provenance',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(w,/workflow_dispatch:\s+inputs:/);
  assert.match(w,/release_branch_ref:\s+description:[\s\S]*?required: true/);
  assert.match(w,/release_task_id:\s+description:[\s\S]*?required: true/);
  assert.match(w,/EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref/);
  assert.match(w,/EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id/);
  assert.match(w,/validate-ekodi-ai-change-orchestration\.mjs\" --release/);
  assert.doesNotMatch(w,/EKODI_ORCHESTRATION_STATIC_POLICY/);
});
test('Orchestrator convergence dispatches Church Pages only from scoped source change',async()=>{
  const s=await read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(s,/const churchPagesTouched=changedFiles\.some/);
  assert.match(s,/file==='\.github\/workflows\/deploy-ekodi-church-homepage\.yml'/);
  assert.match(s,/if\(churchPagesTouched\)/);
  assert.match(s,/actions\/workflows\/deploy-ekodi-church-homepage\.yml\/dispatches/);
  assert.match(s,/release_branch_ref:branch,release_task_id:taskId/);
  assert.match(s,/release receipt is not authorized/);
});
test('Church Pages production proof checks newly authorized inline asset on real domain',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(w,/test -s "church\/\$file"/);
  assert.match(w,/church-worship-admin\.js/);
  assert.match(w,/node --check "church\/\$file"/);
  assert.match(w,/https:\/\/ekodi\.kr\/ekodichurch\/church-worship-admin\.js\?release=\$\{release\}/);
  assert.match(w,/grep -Fq 'scope=worship-access' \/tmp\/church-worship-admin\.js/);
  assert.match(w,/CHURCH_SOURCE_SHA/);
});

test('Church weekly date manifest and context editing are verified by guarded release',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(w,/church-weekly-worship\\.js/);
  assert.match(w,/church-weekly-worship\\.css/);
  assert.match(w,/worship\\/weekly\\.json/);
  assert.match(w,/2026-10-18\\/materials\\.json/);
  assert.match(w,/data-church-weekly/);
  assert.match(w,/weekly_manifest/);
  assert.match(w,/weekly_service/);
  assert.match(w,/jq -e '.schema==/);
  assert.match(w,/CHURCH_SOURCE_SHA/);
});
test('Church pastor admin changes dispatch guarded Shared Site Core after official orchestration merge',async()=>{
  const s=await read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(s,/file==='church-pastor-admin-page\\.js'/);
  assert.match(s,/if\\(sharedSiteTouched\\)/);
  assert.match(s,/actions\\/workflows\\/deploy-site-core\\.yml\\/dispatches/);
});
