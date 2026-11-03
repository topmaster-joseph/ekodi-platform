import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migration=read('supabase/migrations/20261103142625_community_reading_shared_workspace.sql');
const workflow=read('.github/workflows/deploy-community-reading-schema.yml');
const apiWorkflow=read('.github/workflows/deploy-community-api.yml');
const converger=read('scripts/converge-orchestrated-pr-merge.mjs');
const hash=s=>{const bytes=Buffer.from(s.replace(/\r\n/g,'\n'));return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');};

test('reading schema release pins exact reviewed source and prohibits destruction',()=>{
  const expected='0335b407903342f624f73b441bdebac662acec62';
  assert.equal(hash(migration),expected);
  assert.ok(workflow.includes('PINNED_BLOB: '+expected));
  assert.ok(workflow.includes('git hash-object "$MIGRATION"'));
  assert.doesNotMatch(migration,/\b(drop\s+table|truncate\s+table|drop\s+column)\b/i);
  assert.ok(migration.includes('revoke all on table public.community_reading_entries from public,anon,authenticated'));
  assert.ok(migration.includes('security invoker'));
});

test('only protected exact main, valid receipt and authenticated manual dispatch can mutate PROD',()=>{
  assert.ok(workflow.includes("github.event_name == 'workflow_dispatch'"));
  assert.ok(workflow.includes('environment: production'));
  assert.ok(workflow.includes('expected_main_sha'));
  assert.ok(workflow.includes('release-receipt?taskId'));
  assert.ok(workflow.includes('authorized==true'));
  assert.ok(workflow.includes('git/ref/heads/main'));
  assert.ok(workflow.includes('DEV_PROJECT: lxcxwbdwwojjkgybbqii'));
  assert.ok(workflow.includes('PROD_PROJECT: renzehysxirjilvdxacv'));
  assert.ok(workflow.includes('query "$DEV_PROJECT" scripts/sql/community-reading-dev-role-e2e.sql false'));
  assert.ok(workflow.includes('query "$PROD_PROJECT" "$MIGRATION" false'));
  assert.ok(workflow.includes('.table_count==0 or .[0].table_count==4'));
  assert.ok(workflow.includes("body")===false || workflow.includes('content_type')===false);
  assert.ok(!/\n\s*push:\s*\n\s*branches:\s*\[main\]/.test(workflow));
});

test('the schema dispatches the guarded API only after DEV/PROD proof; API does not deploy on PR',()=>{
  assert.ok(workflow.indexOf('Production schema RLS') < workflow.indexOf('Dispatch official Community API release'));
  assert.ok(workflow.includes('deploy-community-api.yml/dispatches'));
  assert.ok(apiWorkflow.includes('workflow_dispatch:'));
  assert.ok(apiWorkflow.includes('environment: production'));
  assert.ok(apiWorkflow.includes('release-receipt?taskId'));
  assert.ok(apiWorkflow.includes('Refuse API promotion unless production reading RLS'));
  assert.ok(apiWorkflow.includes('deno check --node-modules-dir=auto'));
  assert.ok(apiWorkflow.includes("test \"$jwt\" = 'true'"));
  assert.ok(apiWorkflow.includes('Recover previous guarded code after failed verification'));
  assert.ok(!/\n\s*push:\s*\n\s*branches:\s*\[main\]/.test(apiWorkflow));
});

test('only the official post-merge orchestrator can dispatch new private schema',()=>{
  const start=converger.indexOf('async function dispatchPostMergeDeploys()');
  const end=converger.indexOf('const RETRIGGER_WORKFLOWS=',start);
  const section=converger.slice(start,end);
  assert.ok(converger.includes('const readingSchemaTouched=changedFiles.some'));
  assert.ok(section.includes('if(readingSchemaTouched)'));
  assert.ok(section.includes('mergedPr.data?.merged!==true'));
  assert.ok(section.includes("String(mainHead.data?.object?.sha||'')!==mergeSha"));
  assert.ok(section.includes("deploy-community-reading-schema.yml/dispatches"));
  assert.ok(section.includes('expected_main_sha:mergeSha'));
  assert.ok(section.includes("authority:'ekodi-orchestrator'"));
});
