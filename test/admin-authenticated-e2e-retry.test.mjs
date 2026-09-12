import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const retrySource = () => readFile(new URL('../scripts/admin-authenticated-e2e-retry.mjs', import.meta.url), 'utf8');
const workerSource = () => readFile(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs', import.meta.url), 'utf8');
const workflowSource = () => readFile(new URL('../.github/workflows/admin-authenticated-e2e.yml', import.meta.url), 'utf8');
const productionWorkflowSource = () => readFile(new URL('../.github/workflows/verify-admin-authenticated-production-e2e.yml', import.meta.url), 'utf8');
const sharedWorkflowSource = () => readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');

test('authenticated Admin E2E isolates every menu in a fresh Chromium process and retries only that menu once', async () => {
  const source = await retrySource();
  assert.match(source, /const maxAttemptsPerMenu = 2/);
  assert.match(source, /const menuTimeoutMs = 30_000/);
  assert.match(source, /adminMenuOrder\(\)/);
  assert.match(source, /spawn\(process\.execPath, \[script\]/);
  assert.match(source, /'scripts\/admin-authenticated-e2e-menu-worker\.mjs'/);
  assert.match(source, /E2E_MENU_ID: menuId/);
  assert.match(source, /brand-new Chromium process/);
  assert.match(source, /isolated-menu-renderers\+canonical-assist-roundtrip/);
  assert.match(source, /runCanonicalAssist\(\)/);
});

test('isolated worker skips redundant clicks only when the active context tab has a visible rendered panel', async () => {
  const source = await workerSource();
  assert.match(source, /let alreadyActive = aria === 'true'/);
  assert.match(source, /stage\('active-panel-check'\)/);
  assert.match(source, /const activeState = await visiblePanelState\(\)/);
  assert.match(source, /alreadyActive = Boolean\(activeState\.panelFound && activeState\.selected && activeState\.textLength >= 4\)/);
  assert.match(source, /if \(!alreadyActive\) await clickFast\(tab\)/);
  assert.match(source, /click\(\{ force: true, noWaitAfter: true/);
  assert.match(source, /destination\.hostname !== 'accounts\.google\.com'/);
  assert.match(source, /Production menu registry missing/);
});

test('production Admin workflow keeps the isolated recovery runner wired', async () => {
  const workflow = await workflowSource();
  assert.match(workflow, /scripts\/admin-authenticated-e2e-retry\.mjs/);
  assert.match(workflow, /run: node scripts\/admin-authenticated-e2e-retry\.mjs/);
});


test('Shared Site release uses the same isolated authenticated Admin verifier', async () => {
  const workflow = await sharedWorkflowSource();
  assert.match(workflow, /run: node scripts\/admin-authenticated-e2e-retry\.mjs/);
  assert.doesNotMatch(workflow, /run: node scripts\/admin-authenticated-e2e\.mjs\s*$/m);
});

test('isolated Tax E2E verifies authenticated handoff and value-preserving supplier save in production verification', async () => {
  const source = await workerSource();
  const productionWorkflow = await productionWorkflowSource();
  assert.match(source, /destination\.hostname === 'tax\.ekodi\.kr'/);
  assert.match(source, /page\.waitForURL/);
  assert.match(source, /async function waitForAdminNavigationIdle\(\)/);
  assert.match(source, /if \(menuId === 'tax'\) await waitForAdminNavigationIdle\(\)/);
  assert.match(source, /stableSamples >= 2/);
  assert.match(source, /sessionStorage\.getItem\('ekodi-auth-token'\)/);
  assert.match(source, /button\[data-tab=\"suppliers\"\]/);
  assert.match(source, /if \(writeVerification\) \{\s+const suppliersTab/);
  assert.match(source, /authenticated supplier read failed HTTP/);
  assert.match(source, /state:writeVerification \? 'visible' : 'attached'/);
  assert.match(source, /response\.request\(\)\.method\(\) === 'PUT'/);
  assert.match(source, /supplier UI save returned HTTP/);
  assert.match(source, /value-preserving save changed fields/);
  assert.match(source, /persistenceVerified:true/);
  assert.match(productionWorkflow, /E2E_TAX_WRITE_VERIFY: '1'/);
});

test('isolated renderer treats aria-busy on the panel root as active work', async () => {
  const source = await workerSource();
  assert.match(source, /\[panel, \.\.\.panel\.querySelectorAll/);
  assert.match(source, /waitForSettledPanel/);
  assert.doesNotMatch(source, /await page\.waitForTimeout\(2_000\)/);
});

test('public-site controls E2E proves the live Control API and CGMA form render', async () => {
  const source = await workerSource();
  assert.match(source, /verifyPublicSiteControls/);
  assert.match(source, /fetch\('https:\/\/api\.ekodi\.kr\/api\/control\/public-sites'/);
  assert.match(source, /origin: 'https:\/\/admin\.ekodi\.kr'/);
  assert.match(source, /authorization: `Bearer \$\{token\}`/);
  assert.match(source, /access-control-allow-origin/);
  assert.match(source, /page\.evaluate\(\(\) => window\.EKODIPublicSiteControls\.load\(\)\)/);
  assert.match(source, /form\[data-public-site-id="cgma"\]/);
  assert.match(source, /message\.includes\('상태를 확인했습니다'\)/);
  assert.match(source, /menuId === 'public-site-controls'/);
});

test('AI settings E2E proves protected policy, Router Score and locked UI without production mutation', async () => {
  const source = await workerSource();
  assert.match(source, /verifyAiSettings/);
  assert.match(source, /api\/control\/ai\/v8\/collaboration-settings/);
  assert.match(source, /AI_ROUTER_SCORE_POLICY\.version/);
  assert.match(source, /Collaboration ON · LOCK/);
  assert.match(source, /Cloud First · LOCK/);
  assert.match(source, /productionMutation:false/);
  assert.match(source, /menuId === 'ai-settings'/);
});

test('Control staging writes and reloads AI collaboration settings only in the isolated local D1', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-control-api.yml', import.meta.url), 'utf8');
  const verifier = await readFile(new URL('../scripts/verify-ai-collaboration-settings-roundtrip.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /ai-settings-e2e@ekodi\.local/);
  assert.match(workflow, /verify-ai-collaboration-settings-roundtrip\.mjs/);
  assert.match(verifier, /method: 'PUT'/);
  assert.match(verifier, /audit\?limit=5/);
  assert.match(verifier, /productionMutation: false/);
  assert.match(verifier, /requireHumanApprovalForDestructiveAction/);
});