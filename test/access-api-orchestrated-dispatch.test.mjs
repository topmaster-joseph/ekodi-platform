import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Access API is explicitly included in authoritative post-merge dispatch selection',async()=>{
 const source=await read('scripts/converge-orchestrated-pr-merge.mjs');
 assert.match(source,/const accessApiTouched=changedFiles\.some\(file=>/);
 assert.match(source,/file\.startsWith\('supabase\/functions\/access-api\/'\)/);
 assert.match(source,/file\.startsWith\('supabase\/functions\/_shared\/'\)/);
 assert.match(source,/if\(accessApiTouched\)\{[\s\S]*?actions\/workflows\/deploy-access-api\.yml\/dispatches/);
 assert.match(source,/workflow:'deploy-access-api\.yml',pr:pr\.number,taskId,branch,authority:'ekodi-orchestrator'/);
 assert.match(source,/inputs:\{release_branch_ref:branch,release_task_id:taskId\}/);
 assert.match(source,/if\(!dispatch\.r\.ok\)fail\('Access API deploy dispatch failed/);
});

test('Access API production refuses manual untrusted branch and requires EKODI task receipt',async()=>{
 const wf=await read('.github/workflows/deploy-access-api.yml');
 assert.match(wf,/workflow_dispatch:[\s\S]*?release_branch_ref:/);
 assert.match(wf,/workflow_dispatch:[\s\S]*?release_task_id:/);
 assert.match(wf,/REQUESTED_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \}\}/);
 assert.match(wf,/REQUESTED_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \}\}/);
 assert.match(wf,/EKODI_RELEASE_BRANCH_REF=\$branch/);
 assert.match(wf,/EKODI_RELEASE_TASK_ID=\$\{task:-\$derived_task\}/);
 assert.match(wf,/Missing authoritative orchestrator release provenance/);
 assert.match(wf,/node scripts\/validate-ekodi-ai-change-orchestration\.mjs --release/);
 assert.match(wf,/environment: production/);
 assert.match(wf,/if: github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/);
 assert.match(wf,/if \[ -n "\$task" \] && \[ "\$task" != "\$derived_task" \]/);
 assert.doesNotMatch(wf,/continue-on-error: true/);
});

test('actual Access API source keeps the approved SeonamMedi canonical login return allowlist',async()=>{
 const source=await read('supabase/functions/access-api/index.ts');
 assert.match(source,/site==="seonammedi"&&\(target\.pathname==="\/seonammedi"/);
 assert.match(source,/site==="portal"\|\|site==="seonammedi"/);
 assert.match(source,/if\(!site\|\|!returnTo\)return json\(req,\{error:"invalid_handoff_target"\},400\)/);
});
