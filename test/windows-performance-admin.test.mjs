import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [admin, css, api, agent, member] = await Promise.all([
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.css', import.meta.url), 'utf8'),
  readFile(new URL('../device-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../my/device-care.js', import.meta.url), 'utf8'),
]);

const panel = admin.match(/  function windowsPerformancePanel\(device\) \{[\s\S]*?\n  \}\n\n  function managementPanel/)?.[0] || '';

test('Windows performance UI is integrated only into registered PC admin roster', () => {
  assert.ok(panel, 'Windows panel must exist in canonical admin source');
  assert.match(panel, /device\.management\?\.type !== 'pc'/);
  assert.match(panel, /isInventory\(device\)/);
  assert.match(panel, /device\.capabilities\?\.posAgent === true/);
  assert.match(admin, /const performance = windowsPerformancePanel\(device\)/);
  assert.match(admin, /\.\.\.\(performance \? \[performance\] : \[\]\)/);
  assert.match(css, /EKODI-WINDOWS-PERFORMANCE-001/);
  assert.match(css, /max-width:700px/);
});

test('safe optimization is explicit, constrained and receipt-aware', () => {
  for (const command of ['diagnostics.collect', 'startup.scan', 'updates.scan', 'maintenance.temp_cleanup']) {
    assert.match(panel, new RegExp('makeActionButton\\(device, \\x27' + command.replaceAll('.', '\\.') + '\\x27'));
    assert.match(api, new RegExp('\\x27' + command.replaceAll('.', '\\.') + '\\x27'));
    assert.match(agent, new RegExp('\\x27' + command.replaceAll('.', '\\.') + '\\x27'));
  }
  assert.match(panel, /!connected \|\| !capability\(device, 'storageMaintenance'\) \|\| cleanupPending/);
  assert.match(panel, /cleanup\?\.status === 'failed'/);
  assert.match(panel, /cleanup\?\.status === 'succeeded'/);
  assert.match(panel, /postCleanupDiagnostic/);
  assert.match(panel, /lastDiagnostic\?\.completedAt/);
  assert.match(panel, /lastDiagnostic\.completedAt\)\.getTime\(\) > new Date\(cleanup\.completedAt\)\.getTime\(\)/);
  assert.match(panel, /telemetryAt = device\.settings\?\.health\?\.generatedAt/);
  assert.match(panel, /freePct == null \|\| v\.freePct === '' \? NaN/);
  assert.doesNotMatch(panel, /postCleanupDiagnostic = Boolean\(cleanupFinished && completedAt/);
  assert.match(panel, /실제 완료 영수증 대기/);
  assert.match(admin, /'maintenance\.temp_cleanup': '7일 이상 지난 사용자\/Windows 임시 파일만 정리합니다/);
  assert.match(api, /'maintenance\.temp_cleanup': \{ risk: 'maintain', confirm: true \}/);
  assert.match(agent, /function Clear-SafeTempFiles/);
  assert.match(agent, /AddDays\(-7\)/);
});

test('metrics do not promise benchmark gains or expose generic shell', () => {
  for (const marker of ['cpuLoadPct', 'memoryUsedPct', 'freePct', 'uptimeHours', 'generatedAt', 'recentCommands']) {
    assert.ok(panel.includes(marker), 'missing telemetry: ' + marker);
  }
  assert.match(panel, /점수는 벤치마크가 아니며/);
  assert.doesNotMatch(panel, /Invoke-Expression|cmd\.exe|powershell\.exe|shell\.exec/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage|fetch\(/);
  assert.doesNotMatch(member, /\/api\/control\/devices/);
});

test('cleanup receipt safely projects real aggregate counts and never fabricates zero', () => {
  assert.match(agent, /removedFiles = \$removed/);
  assert.match(api, /if \(commandType === 'maintenance\.temp_cleanup'\) \{/);
  assert.match(api, /Number\.isSafeInteger\(removedFiles\) && removedFiles >= 0/);
  assert.match(api, /summary\.removedFiles = removedFiles/);
  assert.match(panel, /cleanup\.result\?\.freedMB == null \? NaN/);
  assert.match(panel, /cleanup\.result\?\.removedFiles == null \? NaN/);
  assert.match(panel, /Number\.isFinite\(freed\) && freed >= 0/);
  assert.match(panel, /Number\.isFinite\(files\) && files >= 0/);
});

test('aggregate cleanup proof omits private paths, invalid counts and unrelated command counts', () => {
  const fn = api.match(/function summarizeCommandResult\(result = \{\}, commandType = ''\) \{([\s\S]*?)\n\}\n\nfunction managementView/)?.[1];
  assert.ok(fn, 'server projection function should remain testable');
  const summarize = new Function('result', 'commandType', fn);
  assert.deepEqual(
    summarize({ freedMB: 12.1, removedFiles: 7, privatePath: 'C:\\private' }, 'maintenance.temp_cleanup'),
    { freedMB: 12.1, removedFiles: 7 },
  );
  assert.equal(summarize({ removedFiles: -7 }, 'maintenance.temp_cleanup').removedFiles, undefined);
  assert.equal(summarize({ removedFiles: 'not a number' }, 'maintenance.temp_cleanup').removedFiles, undefined);
  assert.equal(summarize({ }, 'maintenance.temp_cleanup').removedFiles, undefined);
  assert.equal(summarize({ removedFiles: 7 }, 'updates.scan').removedFiles, undefined);
});

test('dedicated Windows performance route uses canonical admin, authenticated handoff and PC-only focus', async () => {
  const [routes, handoff] = await Promise.all([
    readFile(new URL('../admin-canonical-routes.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin-central-handoff.js', import.meta.url), 'utf8'),
  ]);
  assert.match(routes, /devices:'ops'/);
  assert.match(routes, /detailSegments/);
  assert.match(routes, /function navigationTarget\(section,loc=window.location,detailSegments=null\)/);
  assert.match(handoff, /target\.pathname=routes\(\)\.pathFor\(r,current\?\.section===r\?current\.detailSegments:\[\]\)/);
  assert.match(admin, /WINDOWS_PERFORMANCE_URL = '\/admin\/ops\/devices\/windows-performance'/);
  assert.match(admin, /function windowsPerformanceRoute\(\)/);
  assert.match(admin, /wrapper\.open = windowsPerformanceRoute\(\) \|\| openRosterGroups\.has\(group\.key\)/);
  assert.match(admin, /windowsPerformanceRoute\(\) && \(device\.management\?\.type !== 'pc' \|\| isInventory\(device\) \|\| device\.capabilities\?\.posAgent === true\)/);
  assert.match(admin, /if \(location\.hash === '#devices' \|\| windowsPerformanceRoute\(\)\) showDevices\(\)/);
  assert.match(admin, /href="\$\{windowsPerformanceRoute\(\) \? '\/admin\/ops\/devices' : WINDOWS_PERFORMANCE_URL\}"/);
  assert.match(css, /EKODI-WINDOWS-PERFORMANCE-LINK-001/);
});
