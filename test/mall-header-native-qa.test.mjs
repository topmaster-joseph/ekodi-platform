import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/verify-ekodi-mall-header-native.yml', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sites/ekodi-mall/scripts/verify-header-native.mjs', import.meta.url), 'utf8');

test('Mall header native canary is a protected read-only release verifier, not another deploy', () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /'EKODI Mall · Stage and Deploy'/);
  assert.match(workflow, /'Deploy EKODI Shared Site Core'/);
  assert.match(workflow, /head_branch == 'main'/);
  assert.match(workflow, /conclusion == 'success'/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /playwright@1\.55\.0/);
  assert.match(workflow, /verify-header-native\.mjs/);
  assert.doesNotMatch(workflow, /wrangler deploy|workflow_dispatch:.*secret|CLOUDFLARE_API_TOKEN|GITHUB_TOKEN|toss[_-]secret/i);
});

test('Mall header native test covers guest + simulated signed-in user and all responsive widths', () => {
  for (const marker of [
    '1440, 1366, 900, 768, 390, 320',
    'syntheticSessionKey',
    'liveAccountSignInProven: false',
    'purchaseOrLogoutPerformed: false',
    'data-mall-account',
    'data-mall-logout',
    'mallGlobalSearch',
    '비비큐청계점',
    'getBoundingClientRect()',
    'duplicateAccountCount',
    'synthetic-member',
    'guest',
  ]) assert.ok(browser.includes(marker), 'missing native header proof: ' + marker);
  assert.match(browser, /context\.addInitScript/);
  assert.match(browser, /context\.close\(\)/);
  assert.doesNotMatch(browser, /\.click\(|request\.post\(|fetch\([^)]*method:\s*['"]POST/);
  assert.doesNotMatch(browser, /localStorage\.getItem\(['"]sb-/);
});

test('browser evidence artifact records synthetic scope without user secret leakage', () => {
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(browser, /releaseCandidateSha/);
  assert.match(browser, /credentialMode: 'browser-local-synthetic-only'/);
  assert.match(browser, /candidateCssInjected: process\.env\.GITHUB_EVENT_NAME === 'pull_request'/);
  assert.match(browser, /liveCssValidated: process\.env\.GITHUB_EVENT_NAME !== 'pull_request'/);
  assert.match(browser, /page\.addStyleTag\(\{ content: candidateCss \}\)/);
  assert.match(browser, /new URL\('\.\.\/assets\/mall-account-header\.css', import\.meta\.url\)/);
  assert.match(browser, /writeFile\(outDir \+ '\/evidence\.json'/);
  assert.doesNotMatch(browser, /process\.env\.(?:TOKEN|SECRET|PASSWORD|API_KEY)/);
});
