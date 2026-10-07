import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = () => readFile(new URL('../scripts/verify-admin-production-ui-e2e.mjs', import.meta.url), 'utf8');

test('synthetic production Admin UI verifier waits for lazy panel content to settle', async () => {
  const text = await source();
  assert.match(text, /text\.length > 0/);
  assert.match(text, /style\.display !== 'none'/);
  assert.match(text, /timeout: 12000/);
});

test('synthetic production Admin UI verifier isolates backend auth side effects between menus', async () => {
  const text = await source();
  assert.match(text, /backend 401 from one lazy module cannot hide the shell and poison later UI checks/);
  assert.match(text, /await page\.goto\(ADMIN_URL, \{ waitUntil: 'domcontentloaded', timeout: 45000 \}\);\s*await waitForAdminShell\(\);\s*selectedWorkArea = null;/);
});

test('synthetic production Admin UI verifier stubs the canonical apex session route with a fully authenticated super-admin contract', async () => {
  const text = await source();
  assert.match(text, /page\.route\('https:\/\/ekodi\.kr\/api\/session'/);
  assert.match(text, /authenticated:\s*true/);
  assert.match(text, /role:\s*'super_admin'/);
  assert.doesNotMatch(text, /page\.route\('https:\/\/api\.ekodi\.kr\/api\/session'/);
});



test('synthetic production Admin UI verifier accepts the role-projected platform-admin scroll contract', async () => {
  const text = await source();
  assert.match(text, /sidebarOverflowY !== 'hidden'/);
  assert.match(text, /!\['auto','scroll'\]\.includes\(workbenchState\.navOverflowY\)/);
  assert.match(text, /navIndependentScroll !== 'platform-admin'/);
  assert.match(text, /role-projected sidebar scroll contract failed/);
  assert.doesNotMatch(text, /navOverflowY !== 'hidden'/);
  assert.doesNotMatch(text, /navIndependentScroll !== 'false'/);
});

test('synthetic production Admin UI verifier targets the canonical apex Admin path', async () => {
  const text = await source();
  assert.match(text, /const ADMIN_URL = process\.env\.ADMIN_URL \|\| 'https:\/\/ekodi\.kr\/admin\/'/);
  assert.doesNotMatch(text, /https:\/\/admin\.ekodi\.kr\//);
});

test('synthetic production Admin UI verifier validates tax handoff without navigating the Admin page', async () => {
  const text = await source();
  assert.match(text, /const href = await source\.getAttribute\('href'\)/);
  assert.match(text, /context\.request\.get\(href, \{ maxRedirects: 5, timeout: 20000 \}\)/);
  assert.match(text, /if \(!page\.url\(\)\.startsWith\(ADMIN_URL\)\)/);
  assert.match(text, /ok handoff-link/);
  assert.doesNotMatch(text, /taxNavigationPattern|taxRequestPending|taxCommitPending/);
});

test('synthetic production Admin UI verifier verifies every protected admin handoff as an endpoint instead of waiting for a local panel', async () => {
  const text = await source();
  assert.match(text, /definition\?\.href && definition\.adminHandoff === true/);
  assert.match(text, /admin handoff endpoint returned/);
  assert.match(text, /kind:'handoff'/);
  assert.match(text, /ok handoff-link/);
  const handoffBranch = text.indexOf('definition?.href && definition.adminHandoff === true');
  const panelWait = text.indexOf('window.EKODIAdminPanels?.current?.() === section');
  assert.ok(handoffBranch >= 0 && panelWait > handoffBranch, 'protected handoffs must exit before local panel assertions');
});

test('synthetic production Admin UI verifier follows direct registry href menus through a popup contract', async () => {
  const text = await source();
  assert.match(text, /getAdminMenuItem/);
  assert.match(text, /definition\?\.href && definition\.adminHandoff !== true/);
  assert.match(text, /page\.waitForEvent\('popup', \{ timeout: 10000 \}\)/);
  assert.match(text, /ok direct-href/);
  const directHrefBranch = text.indexOf('definition?.href && definition.adminHandoff !== true');
  const panelWait = text.indexOf('window.EKODIAdminPanels?.current?.() === section');
  assert.ok(directHrefBranch >= 0 && panelWait > directHrefBranch, 'direct href menus must exit before local panel assertions');
});


test('synthetic production Admin UI verifier requires visible left navigation and never falls back to hidden context tabs', async () => {
  const text = await source();
  assert.match(text, /async function resolveMenuTrigger\(id, group\)/);
  assert.match(text, /admin-detail-item\[data-admin-detail-section=/);
  assert.match(text, /data-admin-detail-more=/);
  assert.match(text, /no visible left-navigation trigger/);
  assert.match(text, /const alreadyActive = await page\.evaluate\(section => window\.EKODIAdminPanels\?\.current\?\.\(\) === section, id\)/);
  assert.match(text, /if \(!alreadyActive\) \{[\s\S]*const trigger = await resolveMenuTrigger\(id, group\);[\s\S]*await dispatchClick\(trigger\);[\s\S]*activation retry after slow\/lazy module response[\s\S]*const retryTrigger = await resolveMenuTrigger\(id, group\);[\s\S]*await dispatchClick\(retryTrigger\);/);
  assert.match(text, /timeout: 20000/);
  assert.doesNotMatch(text, /contextTab\.waitFor/);
  assert.doesNotMatch(text, /const alreadyActive = await contextTab\.evaluate/);
});


test('synthetic production Admin UI verifier exercises the real bottom command console without backend mutation', async () => {
  const text = await source();
  assert.match(text, /page\.route\('https:\/\/ekodi\.kr\/api\/control\/ai\/assist'/);
  assert.match(text, /관리자 명령창 연결 확인/);
  assert.match(text, /관리자 명령창 연결 정상/);
  assert.match(text, /#ekodiAssistBootstrap input/);
  assert.match(text, /#ekodiAssistBootstrap \.ekodi-assist-bootstrap-send/);
  assert.match(text, /admin-command-home/);
  assert.match(text, /admin-command-active/);
  assert.match(text, /command-roundtrip/);
  assert.match(text, /expectedCount = menus\.length \+ 1/);
});


test('Admin production UI workflow validates verifier contracts on PRs and reserves live canary for postdeploy runs', async () => {
  const workflow = await readFile(new URL('../.github/workflows/verify-admin-production-ui-e2e.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Validate production verifier contract on pull requests/);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /github\.event_name != 'pull_request'/);
  assert.match(workflow, /validate-canonical-api-execution\.mjs/);
  assert.match(workflow, /apex-api-retirement\.test\.mjs/);
  assert.match(workflow, /verify-admin-production-ui-e2e\.mjs/);
});
