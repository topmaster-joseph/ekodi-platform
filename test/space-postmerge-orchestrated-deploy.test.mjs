import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>readFile(path.join(root,file),'utf8');

test('orchestrated merge dispatches guarded Operating Space release only for relevant changes',async()=>{
 const source=await read('scripts/converge-orchestrated-pr-merge.mjs');
 assert.match(source,/const spaceTouched=changedFiles\.some/);
 assert.ok(source.includes("file.startsWith('space/')"));
 assert.ok(source.includes("file==='deploy/manifests/space.worker.json'"));
 assert.ok(source.includes("if(spaceTouched)"));
 assert.ok(source.includes("'/actions/workflows/deploy-space.yml/dispatches'"));
 assert.ok(source.includes("release_branch_ref:branch,release_task_id:taskId"));
 assert.ok(source.includes("if(!dispatch.r.ok)fail('Operating Space deploy dispatch failed"));
});

test('production-only space workflow requires verifiable orchestrator receipt inputs',async()=>{
 const workflow=await read('.github/workflows/deploy-space.yml');
 assert.match(workflow,/workflow_dispatch:\s+inputs:\s+release_branch_ref:/);
 assert.ok(workflow.includes('EKODI_RELEASE_BRANCH_REF: ${{ inputs.release_branch_ref || \'\' }}'));
 assert.ok(workflow.includes('EKODI_RELEASE_TASK_ID: ${{ inputs.release_task_id || \'\' }}'));
 assert.ok(workflow.includes('Verify orchestrator release intent'));
 assert.ok(workflow.includes('EKODI_RELEASE_BRANCH_REF'));
 assert.ok(workflow.includes('--release'));
 assert.ok(workflow.includes("github.ref == 'refs/heads/main'"));
 const manifest=JSON.parse(await read('deploy/manifests/space.worker.json'));
 const act=manifest.worker.requests.find(x=>x.url==='https://ekodi.kr/ekodimission/activities');
 assert.ok(act?.expect.includes('2026 제주 여름캠프'));
});
