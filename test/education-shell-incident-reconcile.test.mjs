import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('issue label cannot dispatch arbitrary release or a non-main mutation',async()=>{
  const [workflow,source]=await Promise.all([
    read('.github/workflows/reconcile-education-shell-incident.yml'),
    read('scripts/reconcile-education-shell-incident.mjs')
  ]);
  for(const value of [
    "issues:","types: [labeled]","github.event.issue.number == 4813",
    "github.event.label.name == 'ekodi-education-shell-reconcile'",
    "github.event.issue.state == 'open'","environment: production",
    "ref: main","persist-credentials: false","actions: write",
    "node scripts/reconcile-education-shell-incident.mjs"
  ]) assert.ok(workflow.includes(value),value);
  for(const value of [
    "ISSUE=4813","SOURCE_PR=4808",
    "SOURCE_SHA='6cdb44bb6d09cc6a8d9b30086b42ea050a4957de'",
    "RECOVERY_PR=4811",
    "MERGE_SHA='9ac525bf9bd4f4514e11d77b9b55ac510682fa10'",
    "TASK='orch_recovery_6cdb44bb6d09cc6a8d9b30086b42ea05'",
    "EKODI-HUMAN-GATE-APPROVE:",
    "owners.has(actor)","event.action!=='labeled'",
    "event.issue?.state!=='open'","source.head?.sha!==SOURCE_SHA",
    "recovery.merge_commit_sha!==MERGE_SHA","ancestry.behind_by",
    "receipt.authorized!==true","workflow_dispatch&per_page=100",
    "actions/workflows/deploy-ekodi-shell.yml/dispatches",
    "release_branch_ref:BRANCH,release_task_id:TASK",
    "verification:'pending-genuine-shell-and-education-native-acceptance'"
  ]) assert.ok(source.includes(value),value);
  assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(source,/api.cloudflare.com|wrangler deploy|merge_method|force:true/);
  assert.ok(source.indexOf('recovery.merge_commit_sha!==MERGE_SHA')<
      source.indexOf('actions/workflows/deploy-ekodi-shell.yml/dispatches'));
  assert.ok(source.indexOf('receipt.authorized!==true')<
      source.indexOf('actions/workflows/deploy-ekodi-shell.yml/dispatches'));
});
