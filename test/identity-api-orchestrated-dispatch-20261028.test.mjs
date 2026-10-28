import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 2026-10-28: the Central Identity API lane was never dispatched after orchestrator merges
// (GITHUB_TOKEN merges emit no push events) and its manual run had no release provenance,
// so every production run stopped at the EKODI AI Orchestration Gate. It now follows the
// same authoritative dispatch contract as the Access API lane.
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Identity API is included in authoritative post-merge dispatch selection',async()=>{
  const source=await read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(source,/const identityApiTouched=changedFiles\.some\(file=>/);
  assert.match(source,/file\.startsWith\('supabase\/functions\/identity-api\/'\)/);
  assert.match(source,/\[identityApiTouched,'deploy-identity-api\.yml'\]/);
  assert.match(source,/if\(identityApiTouched\)\{[\s\S]*?actions\/workflows\/deploy-identity-api\.yml\/dispatches[\s\S]*?inputs:\{release_branch_ref:branch,release_task_id:taskId\}/);
  assert.match(source,/if\(!dispatch\.r\.ok\)fail\('Identity API deploy dispatch failed/);
});

test('Identity API production recovers orchestrator provenance before the release gate',async()=>{
  const wf=await read('.github/workflows/deploy-identity-api.yml');
  assert.match(wf,/workflow_dispatch:[\s\S]*?release_branch_ref:[\s\S]*?release_task_id:/);
  assert.match(wf,/REQUESTED_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \}\}/);
  assert.match(wf,/EKODI_RELEASE_TASK_ID=\$\{task:-\$derived_task\}/);
  assert.match(wf,/Missing authoritative orchestrator release provenance/);
  assert.ok(wf.indexOf('Recover exact orchestrator release provenance')<wf.indexOf('EKODI AI Orchestration Gate'));
  assert.match(wf,/node scripts\/validate-ekodi-ai-change-orchestration\.mjs --release/);
  assert.match(wf,/if: github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/);
  assert.doesNotMatch(wf,/continue-on-error: true/);
});

test('Naver/Kakao keys sync from dedicated GitHub secrets without enabling login',async()=>{
  const wf=await read('.github/workflows/deploy-identity-api.yml');
  const sync=wf.slice(wf.indexOf('Sync dormant Naver/Kakao login keys'),wf.indexOf('- name: Deploy identity API'));
  assert.match(sync,/secrets\.NAVER_LOGIN_CLIENT_ID/);
  assert.match(sync,/secrets\.KAKAO_LOGIN_REST_API_KEY/);
  assert.match(sync,/secrets set --project-ref "\$PROJECT_REF" --env-file "\$env_file"/,'keys never appear on a command line');
  assert.match(sync,/umask 077/);
  assert.doesNotMatch(sync,/\bupdate\s+public\.identity_providers\b|set\s+enabled\s*=\s*true/i,'syncing keys must not switch any login on');
  assert.ok(wf.indexOf('Sync dormant Naver/Kakao login keys')>wf.indexOf('EKODI AI Orchestration Gate'));
});
