import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { workspaceAdminScript } from '../workspace-admin-page.js';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';

const scriptUrl=new URL('../scripts/verify-ekodimission-admin-production-e2e.mjs',import.meta.url);
const workflowUrl=new URL('../.github/workflows/verify-ekodimission-admin-production-e2e.yml',import.meta.url);

test('Mission tenant-admin production E2E exercises the deployed Activity participant surface',async()=>{
  const source=await readFile(scriptUrl,'utf8');
  for(const marker of [
    "https://ekodi.kr",
    "/ekodimission/admin",
    "/ekodimission/admin/activities",
    "운영 홈",
    "rootTitle",
    "activityEntryVisible",
    "신청자 관리",
    "행사 · 신청자",
    "ekodi-workspace-admin-session",
    "current_site_activity_contexts",
    "activity_admin_snapshot",
    "activity_admin_update_participation",
    "activity_admin_add_participant",
    "activity_admin_share_status",
    "activity_admin_create_share",
    "activity_admin_revoke_share",
    "data-activity-checkin",
    "privacyConsent",
    "단순 참가자",
    "production-assets+synthetic-tenant-auth-data",
    "Mission admin signed-out login link missing",
    "textContent?.includes('로그인 필요')",
    "#mainPanel a.button.primary[href*=\"/auth/\"]",
    "searchParams.get('site')!=='mission'",
    "authReturnToExact:true",
    "preAuthNavigationVisible:true",
    "activityUrl",
    "행사 · 신청자",
    "captureWorkspaceAsset",
    "signed-out-auth-boundary",
    "signedOutState",
    "productionAssetTypes",
    "productionNosniff",
    "signed-out-failure.png",
    "details > summary",
    "details.activity-add",
    "rowNumbering",
    "rowNumberingAfterAdd"
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


test('Mission canonical admin root remains owned by the tenant Workspace Admin router',()=>{
  assert.equal(isWorkspaceAdminPathShape('/ekodimission/admin'),true);
  assert.equal(isWorkspaceAdminPathShape('/ekodimission/admin/activities'),true);
});

test('Mission workspace admin selects mission auth scope instead of shared space auth',async()=>{
  const source=await readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
  assert.ok(source.includes("if(workspace==='ekodimission')return'mission'"));
  assert.ok(source.includes("u.searchParams.set('site',workspaceAuthSite())"));
  assert.ok(source.includes("u.searchParams.set('return_to',location.origin+location.pathname+location.search)"));
  assert.ok(source.includes("MISSION_RETURN_KEY='ekodi-mission-admin-return'"));
  assert.ok(source.includes("rememberMissionReturn"));
  assert.ok(source.includes("consumeMissionReturn"));
});


test('generated Workspace Admin runtime is executable JavaScript with nosniff-safe headers',async()=>{
  const response=workspaceAdminScript();
  const type=response.headers.get('content-type')||'';
  assert.match(type,/text\/javascript/i);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('cache-control'),'no-store');
  const source=await response.text();
  assert.match(source,/boot\(\)/);
  assert.doesNotThrow(()=>new Function(source));
  assert.equal(/<html[\s>]/i.test(source),false);
  assert.match(source,/__EKODI_WORKSPACE_ADMIN_RUNTIME__/);
  assert.doesNotMatch(source,/^const __name=/m);
});
