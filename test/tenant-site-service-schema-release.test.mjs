import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const path=(name)=>readFileSync(new URL(name,root),'utf8');
const workflow=path('.github/workflows/deploy-tenant-site-service-schema.yml');
const migration=path('supabase/migrations/20261102162000_tenant_site_service_catalog.sql');
const aiToolMigration=path('supabase/migrations/20261103004500_tenant_ai_tool_selection.sql');
const converger=path('scripts/converge-orchestrated-pr-merge.mjs');
const blob=source=>{const lf=source.replace(/\r\n/g,'\n');return createHash('sha1').update('blob '+Buffer.byteLength(lf)+'\0'+lf).digest('hex');};

test('tenant schema workflow pins the exact reviewed migration',()=>{
  assert.equal(blob(migration),'c4cbedeb3cfc815e7e89346411f7ad1121afa9f0');
  assert.equal(blob(aiToolMigration),'191ea282e70871a66cdbdb47f303de8284bff1c5');
  assert.match(workflow,/PINNED_BLOB: c4cbedeb3cfc815e7e89346411f7ad1121afa9f0/);
  assert.match(workflow,/AI_TOOL_PINNED_BLOB: 191ea282e70871a66cdbdb47f303de8284bff1c5/);
  assert.match(workflow,/git hash-object "\$MIGRATION"/);
  assert.doesNotMatch(migration,/\b(drop\s+table|truncate\s+table|drop\s+column)\b/i);
  assert.doesNotMatch(aiToolMigration,/\b(drop\s+table|truncate\s+table|drop\s+column)\b/i);
});

test('protected schema promotion requires authenticated exact receipt and guarded main',()=>{
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/if: github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/\$GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow,/\$GITHUB_SHA.*\$EXPECTED_SHA/);
  assert.match(workflow,/release-receipt\?taskId/);
  assert.match(workflow,/authorized == true/);
  assert.match(workflow,/authority == "ekodi-orchestrator"/);
  assert.match(workflow,/gh api "repos\/\$GITHUB_REPOSITORY\/git\/ref\/heads\/main"/);
  assert.doesNotMatch(workflow,/on:\s*\n\s*push:/);
});

test('development and production validate prerequisites, RLS and RPC privacy',()=>{
  assert.match(workflow,/DEV_PROJECT: lxcxwbdwwojjkgybbqii/);
  assert.match(workflow,/PROD_PROJECT: renzehysxirjilvdxacv/);
  assert.match(workflow,/query "\$DEV_PROJECT" "\$MIGRATION" false/);
  assert.match(workflow,/query "\$DEV_PROJECT" "\$AI_TOOL_MIGRATION" false/);
  assert.match(workflow,/query "\$DEV_PROJECT" "\$tmp\/proof.sql" true/);
  assert.match(workflow,/query "\$PROD_PROJECT" "\$MIGRATION" false/);
  assert.match(workflow,/query "\$PROD_PROJECT" "\$AI_TOOL_MIGRATION" false/);
  assert.match(workflow,/query "\$PROD_PROJECT" "\$tmp\/proof.sql" true/);
  assert.match(workflow,/relrowsecurity/);
  assert.match(workflow,/anon_write_denied/);
  assert.match(workflow,/ai_anon_write_denied/);
  assert.match(workflow,/ai_tools_rls/);
  assert.match(workflow,/service_private/);
  assert.match(workflow,/all\(\.\[\]; \. == true\)/);
});

test('only protected post-merge EKODI converge dispatches promotion',()=>{
  assert.match(converger,/const tenantSiteSchemaTouched=changedFiles\.some/);
  assert.match(converger,/file==='supabase\/migrations\/20261103004500_tenant_ai_tool_selection.sql'/);
  const start=converger.indexOf('async function dispatchPostMergeDeploys()');
  const end=converger.indexOf('const RETRIGGER_WORKFLOWS=',start);
  assert.ok(start>0&&end>start);
  const block=converger.slice(start,end);
  assert.match(block,/if\(tenantSiteSchemaTouched\)/);
  assert.match(block,/mergedPr\.data\?\.merged!==true/);
  assert.match(block,/mainHead\.data\?\.object\?\.sha/);
  assert.match(block,/expected_main_sha:mergeSha/);
  assert.match(block,/deploy-tenant-site-service-schema\.yml/);
  assert.doesNotMatch(block,/if\(tenantSiteSchemaTouched\)[\s\S]*?ref:'[^m]/);
});
