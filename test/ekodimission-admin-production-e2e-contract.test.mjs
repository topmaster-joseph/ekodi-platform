import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptUrl=new URL('../scripts/verify-ekodimission-admin-production-e2e.mjs',import.meta.url);
const workflowUrl=new URL('../.github/workflows/verify-ekodimission-admin-production-e2e.yml',import.meta.url);

test('Mission tenant-admin production E2E exercises the deployed Activity participant surface',async()=>{
  const source=await readFile(scriptUrl,'utf8');
  for(const marker of [
    "https://ekodi.kr",
    "/ekodimission/admin/activities",
    "ekodi-workspace-admin-session",
    "current_site_activity_contexts",
    "activity_admin_snapshot",
    "activity_admin_update_participation",
    "activity_admin_add_participant",
    "data-activity-checkin",
    "privacyConsent",
    "단순 참가자",
    "production-assets+synthetic-tenant-auth-data",
    "Mission admin signed-out login link missing",
    "textContent?.includes('로그인 필요')",
    "#mainPanel a.button.primary[href*=\"/auth/\"]",
    "searchParams.get('site')!=='mission'",
    "authReturnToExact:true"
  ]) assert.ok(source.includes(marker),marker);
  assert.ok(source.includes("p_privacy_consent===true"));
  assert.ok(source.includes("p_status==='attended'"));
  assert.ok(source.includes("page.screenshot"));
  assert.ok(source.includes("workspace-admin.js"));
  assert.ok(source.includes("workspace-admin.css"));
});

test('Mission tenant-admin E2E runs only after a successful Shared Site deploy or explicit manual dispatch and obeys quota protection',async()=>{
  const workflow=await readFile(workflowUrl,'utf8');
  assert.ok(workflow.includes("workflow_run:"));
  assert.ok(workflow.includes("workflows: ['Deploy EKODI Shared Site Core']"));
  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.equal(workflow.includes("schedule:"),false);
  assert.ok(workflow.includes("cloudflare-production-budget.mjs"));
  assert.ok(workflow.includes("steps.quota.outputs.skip_nonessential != 'true'"));
  assert.ok(workflow.includes("Verify EKODI Mission tenant admin production surface"));
  assert.ok(workflow.includes("node scripts/verify-ekodimission-admin-production-e2e.mjs"));
  assert.ok(workflow.includes("Mission production browser E2E skipped because Cloudflare quota protection is active."));
});


test('Mission workspace admin selects mission auth scope instead of shared space auth',async()=>{
  const source=await readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
  assert.ok(source.includes("if(workspace==='ekodimission')return'mission'"));
  assert.ok(source.includes("u.searchParams.set('site',workspaceAuthSite())"));
  assert.ok(source.includes("u.searchParams.set('return_to',location.origin+location.pathname+location.search)"));
});
