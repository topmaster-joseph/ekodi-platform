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
