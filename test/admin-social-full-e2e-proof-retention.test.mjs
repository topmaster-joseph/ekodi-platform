import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowUrl = new URL('../.github/workflows/verify-admin-authenticated-production-e2e.yml', import.meta.url);
const workerUrl = new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url);

test('full authenticated Admin E2E independently retains only sanitized social-panel proof', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const begin = workflow.indexOf('SOCIAL-READONLY-PROOF-ARTIFACT-001');
  const end = workflow.indexOf('ADMIN-ARCH-PROOF-ARTIFACT-001', begin);
  assert.ok(begin >= 0 && end > begin, 'social full-run proof step must precede existing architecture preservation');
  const step = workflow.slice(begin, end);
  assert.match(step, /if: \$\{\{ always\(\) && inputs\.focus_menu == 'all' \}\}/);
  assert.match(step, /uses: actions\/upload-artifact@v4/);
  assert.match(step, /name: admin-social-accounts-proof-\$\{\{ github\.run_id \}\}/);
  assert.match(step, /artifacts\/admin-authenticated-e2e\/menu-social-accounts\.json/);
  assert.match(step, /artifacts\/admin-authenticated-e2e\/social-accounts-\*\.png/);
  assert.match(step, /if-no-files-found: warn/);
  assert.match(step, /retention-days: 7/);
  assert.doesNotMatch(step, /report\.json|admin-authenticated-e2e\/.*\.log|raw-session|fullPage|token/);
});

test('existing focused social-account workflow remains a separate required evidence lane', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /name: Upload focused social-account responsive E2E evidence/);
  assert.match(workflow, /if: \$\{\{ always\(\) && inputs\.focus_menu == 'social-accounts' \}\}/);
  assert.match(workflow, /name: social-account-focused-production-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /if-no-files-found: error/);
});

test('social-account image source crops to its panel and masks registered identity rows', async () => {
  const source = await readFile(workerUrl, 'utf8');
  assert.ok(source.includes("page.locator('#ekodiSocialAccountRegistry').screenshot("));
  assert.ok(source.includes("mask:[page.locator('#ekodiSocialAccountRegistry [data-social-record]')]"));
  assert.ok(source.includes("'social-accounts-'+width+'.png'"));
  assert.ok(source.includes('const widths=[320,390,768,1366,1440]'));
  assert.doesNotMatch(source, /page\.screenshot\(\{[\s\S]{0,100}social-accounts-/);
});
