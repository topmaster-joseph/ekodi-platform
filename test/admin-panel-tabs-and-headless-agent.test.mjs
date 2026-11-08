import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
const agent = await readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8');

test('ADMIN-PANEL-TABS-001: right workspace panels switch blocks by tabs without moving nodes', () => {
  assert.match(sidebar, /export function installAdminPanelTabs/);
  assert.match(sidebar, /installAdminPanelTabs\(document\);/);
  assert.match(sidebar, /devices: Object\.freeze\(\[/);
  for (const label of ['기기 현황', 'PC 연결', '원격 전원', '전용 도구', '변경 이력']) assert.ok(sidebar.includes(`label: '${label}'`), label);
  assert.match(sidebar, /\[data-ekodi-tab-hidden="true"\]\{display:none!important\}/);
  assert.match(sidebar, /:not\(\.hidden-panel\):not\(\[hidden\]\)\{display:flex/);
  assert.match(sidebar, /dataset\.ekodiPanelTabs === 'off'/);
  const install = sidebar.slice(sidebar.indexOf('export function installAdminPanelTabs'), sidebar.indexOf('export function mountAdminSidebar'));
  assert.doesNotMatch(install, /subtree: true/);
  assert.doesNotMatch(install, /appendChild\(node\)|\.append\(node\)/);
});

test('Device Agent scheduled task launches through a headless console so no window flashes', () => {
  assert.match(agent, /\$AgentVersion = '2\.6\.5'/);
  assert.match(agent, /function Get-AgentHiddenLaunchSpec/);
  assert.match(agent, /argument = "--headless powershell\.exe \$agentArguments"/);
  assert.match(agent, /Build -ge 17763/);
  const task = agent.slice(agent.indexOf('function Ensure-AgentTask {'), agent.indexOf('function Copy-SelfToAgentPath'));
  assert.match(task, /New-ScheduledTaskAction -Execute \$launch\.execute -Argument \$launch\.argument/);
  assert.match(agent, /function Repair-AgentTaskHiddenLaunch/);
  assert.match(agent, /Set-ScheduledTask -TaskName \$TaskName -Action \$action/);
  const run = agent.slice(agent.indexOf('function Run-Agent {'));
  assert.match(run, /\[void\]\(Repair-AgentTaskHiddenLaunch\)/);
});

test('device bootstrap .cmd is served as a download, never rendered as text', async () => {
  const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');
  const block = headers.slice(headers.indexOf('/ekodi-device-bootstrap.cmd'));
  assert.match(block, /Content-Disposition: attachment;/);
  assert.match(block, /Content-Type: application\/octet-stream/);
});

test('기기 현황 detail is split into sub-tabs right below the pinned metrics', () => {
  assert.match(sidebar, /'device-status': Object\.freeze\(\[/);
  for (const label of ['기기 목록', '작업 관제', '브라우저 진단', '전원 복구']) assert.ok(sidebar.includes(`label: '${label}'`), label);
  assert.match(sidebar, /selector: '\.device-status-tools', preset: 'device-status'/);
  assert.match(sidebar, /\.device-metrics'/);
  assert.match(sidebar, /anchor\.insertAdjacentElement\('afterend', strip\)/);
});

test('ADMIN-PANEL-TABS-002: own tab bar never disables tabs (no add/remove flicker) and churn trips a breaker', () => {
  assert.match(sidebar, /if \(panel\.querySelector\(PANEL_OWN_TABS_SELECTOR\)\) return null;/);
  assert.match(sidebar, /function isMeaningfulTabLabel/);
  assert.match(sidebar, /PANEL_TAB_CHURN_LIMIT = 8/);
  assert.match(sidebar, /panel\.dataset\.ekodiPanelTabs = 'off';/);
  assert.match(sidebar, /if \(node\.hidden\) \{ if \(last\) last\.nodes\.push\(node\); else pinned\.add\(node\); return; \}/);
});

test('/work/admin renders the platform admin sidebar and a horizontal tab rail', async () => {
  assert.match(sidebar, /\^\\\/\(\?:admin\|work\\\/admin\)\(\?:\\\/\|\$\)/);
  const css = await readFile(new URL('../work-admin.css', import.meta.url), 'utf8');
  assert.match(css, /WORK-ADMIN-TABS-001/);
  assert.match(css, /\.work-admin-rail\{order:-1!important;flex-direction:row!important/);
});

test('panels with their own tabs are left alone, and hidden tabs can be revealed for shortcuts/E2E', async () => {
  // 자체 바로가기(nav)·탭이 있는 화면(비용·인프라, 시스템 구조, 소셜 등)은 자동 탭 제외.
  assert.match(sidebar, /PANEL_OWN_TABS_SELECTOR = 'nav,\[role="tablist"\]:not\(\.admin-panel-tabs\)/);
  assert.match(sidebar, /export function revealAdminPanelTab/);
  assert.match(sidebar, /reveal: revealAdminPanelTab/);
  const e2e = await readFile(new URL('../scripts/verify-admin-production-ui-e2e.mjs', import.meta.url), 'utf8');
  assert.match(e2e, /async function revealPanelTab/);
  assert.match(e2e, /await revealPanelTab\(search\);/);
});
