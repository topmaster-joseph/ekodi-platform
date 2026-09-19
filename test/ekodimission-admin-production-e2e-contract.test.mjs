import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptUrl=new URL('../scripts/verify-ekodimission-admin-production-e2e.mjs',import.meta.url);
const workflowUrl=new URL('../.github/workflows/deploy-site-core.yml',import.meta.url);

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
    "production-assets+synthetic-tenant-auth-data"
  ]) assert.ok(source.includes(marker),marker);
  assert.ok(source.includes("p_privacy_consent===true"));
  assert.ok(source.includes("p_status==='attended'"));
  assert.ok(source.includes("page.screenshot"));
  assert.ok(source.includes("workspace-admin.js"));
  assert.ok(source.includes("workspace-admin.css"));
});

test('Shared Site production release runs Mission tenant-admin E2E after deploy',async()=>{
  const workflow=await readFile(workflowUrl,'utf8');
  assert.ok(workflow.includes("scripts/verify-ekodimission-admin-production-e2e.mjs"));
  assert.ok(workflow.includes("Verify EKODI Mission tenant admin production surface"));
  assert.ok(workflow.includes("node scripts/verify-ekodimission-admin-production-e2e.mjs"));
  assert.ok(workflow.includes("ekodimission-admin-production-e2e"));
});
