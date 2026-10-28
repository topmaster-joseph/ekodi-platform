import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveAdminE2EMenus } from '../scripts/lib/admin-e2e-menu-scope.mjs';

const retry=readFileSync(new URL('../scripts/admin-authenticated-e2e-retry.mjs',import.meta.url),'utf8');
const worker=readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/verify-admin-authenticated-production-e2e.yml',import.meta.url),'utf8');
const ui=readFileSync(new URL('../social-account-admin.js',import.meta.url),'utf8');

test('full Admin menu suite remains default; social diagnostic is explicitly opt-in',()=>{
  const ids=['platform-overview','social-accounts','social'];
  assert.deepEqual(resolveAdminE2EMenus(ids),ids);
  assert.deepEqual(resolveAdminE2EMenus(ids,'all'),ids);
  assert.deepEqual(resolveAdminE2EMenus(ids,'social-accounts'),['social-accounts']);
  assert.throws(()=>resolveAdminE2EMenus(ids,'social'),/Unsupported Admin E2E focus/);
});

test('focused production probe avoids unrelated API polling and unrelated Assist while retaining full-mode checks',()=>{
  assert.match(retry,/const productionConvergenceAttempts = focusOnly \? 1 : 36/);
  assert.match(retry,/if \(!focusOnly\) await waitForMaturityApi\(\)/);
  assert.match(retry,/if \(!fatal && !focusOnly\)/);
  assert.match(retry,/focusOnly \|\| \(aggregate\.assistProbe\?\.passed === true/);
  assert.match(retry,/maxAttemptsPerMenu = focusedDiagnostic \? 1 : 2/);
  assert.match(retry,/isAdminEntryQuotaCircuit\(report\)/);
});

test('live read-only DOM checks cover service search, all filters and bounded record totals',()=>{
  for(const key of ['data-social-provider-card','data-social-result-count','data-social-account-count',
    'data-social-account-source','data-social-account-filter','data-social-account-search','data-social-search']){
    assert.ok(ui.includes(key),'UI source must expose '+key);
  }
  for(const key of ['provider filter ','live provider name search','no-match provider empty state',
    'account source ','account status ','existing EKODI ID live lookup','bounded preview disclosure',
    'account filters reset','identityCount','existingCount']){
    assert.ok(worker.includes(key),'Worker must check '+key);
  }
  assert.match(worker,/recordsTruncated:data\.recordsTruncated === true/);
  assert.match(worker,/await page\.evaluate\(expected =>/);
  assert.doesNotMatch(worker,/POST.*social-identities/);
});

test('five responsive screenshots redact account identifiers and assert architecture isolation',()=>{
  assert.match(worker,/const widths=\[320,390,768,1366,1440\]/);
  assert.match(worker,/mask:\[page\.locator\('#ekodiSocialAccountRegistry \[data-social-record\]'\)\]/);
  assert.match(worker,/architectureHidden:!architectureVisible/);
  assert.match(worker,/await page\.keyboard\.press\('Escape'\)/);
  assert.match(worker,/headingAccessible/);
  assert.match(worker,/horizontalOverflow:document\.documentElement\.scrollWidth>innerWidth\+2/);
  assert.match(worker,/redactedScreenshots:viewports\.length/);
});

test('official workflow preserves full mode, uploads private focused screenshots, revokes real session',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/focus_menu:/);
  assert.match(workflow,/default: all/);
  assert.match(workflow,/if: \$\{\{ inputs\.focus_menu == 'all' \}\}/);
  assert.match(workflow,/social-account-focused-production-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow,/artifacts\/admin-authenticated-e2e\/social-accounts-\*\.png/);
  assert.match(workflow,/retention-days: 7/);
  assert.match(workflow,/Revoke short-lived E2E session/);
});
