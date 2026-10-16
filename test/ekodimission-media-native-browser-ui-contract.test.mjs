import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../scripts/verify-ekodimission-media-moderation-native-ui-e2e.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/verify-ekodimission-admin-production-e2e.yml',import.meta.url),'utf8');

test('Mission media UI E2E uses only production GET assets and mocked synthetic mutations',()=>{
  for(const expected of [
    'chromium.launch({headless:true})',
    'await route.fetch({timeout:20000})',
    'data-media-list',
    "sessionStorage.setItem('ekodi-auth-token',token)",
    "synthetic-native-e2e-not-an-auth-credential",
    '**/ekodimission/api/admin/me',
    '**/ekodimission/api/admin/activity-rpc',
    'activity_admin_hide_media_link',
    'p_hidden===true',
    'media_moderated',
    'publicConsent===true',
    'attempts.length===0',
    'testViewport(390,844)',
    'testViewport(1440,900)',
    "await page.screenshot"
  ])assert.ok(script.includes(expected),expected);
  assert.ok(script.includes("if(!['GET','HEAD'].includes(req.method()))"));
  assert.ok(script.includes("return route.fulfill({status:599"));
  assert.ok(!script.includes('SUPABASE_ACCESS_TOKEN'));
  assert.ok(!script.includes('apply_migration'));
  // The browser must never include production credentials or non-synthetic auth fixtures.
  assert.ok(!script.includes('secrets.SUPABASE_ACCESS_TOKEN'));
  assert.ok(!script.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(!script.includes('https://api.supabase.com/v1/projects/'));
  assert.ok(script.includes('unmocked_mutation_blocked'),'Unexpected HTTP writes must be blocked by default');
  assert.ok(script.includes('status:599'),'Unexpected writes must not be dispatched to the network');
  assert.ok(script.includes('mode:\'real-production-GET-assets+intercepted-synthetic-auth-and-mutations\''));
});

test('EKODI-owned Chromium production harness includes synthetic media UI stage with quota and truthful evidence',()=>{
  for(const expected of [
    'Install Chromium harness',
    'skip_nonessential',
    'node scripts/verify-ekodimission-media-moderation-native-ui-e2e.mjs',
    'ekodimission-media-native-ui-e2e/report.json',
    'Upload synthetic Mission media E2E evidence',
    'workflow_dispatch:',
    "workflows: ['Deploy EKODI Shared Site Core']"
  ])assert.ok(workflow.includes(expected),expected);
  assert.ok(workflow.includes('if: steps.quota.outputs.skip_nonessential != \'true\''));
});
