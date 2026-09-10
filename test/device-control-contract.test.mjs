import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [api, agent, admin, build, entry, security, bootstrap] = await Promise.all([
  readFile(new URL('../device-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../security-edge.js', import.meta.url), 'utf8'),
  readFile(new URL('../ekodi-device-bootstrap.cmd', import.meta.url), 'utf8'),
]);

const commands = [
  'power.always_on','power.presentation','power.normal','power.restore','lock.resume_off','lock.resume_on','autologon.open',
  'diagnostics.collect','network.diagnose','printers.diagnose','startup.scan','startup.disable','startup.restore',
  'maintenance.temp_cleanup','maintenance.safe_optimize','updates.scan','updates.install','profile.workstation.apply','profile.workstation.restore','agent.self_update',
];

test('Device Control routes are behind the mission control entry worker', () => {
  assert.match(entry, /handleDeviceControl/);
  assert.match(entry, /\/api\/control\/devices/);
  assert.match(entry, /\/api\/device-agent/);
});

test('device credentials are stored as hashes and enrollment is one-time', () => {
  assert.match(api, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(api, /code_hash TEXT NOT NULL UNIQUE/);
  assert.match(api, /used_at IS NULL AND expires_at > \?/);
  assert.match(api, /sha256\(token\)/);
  const registryInsert = api.match(/INSERT INTO device_registry[\s\S]*?tokenHash[\s\S]*?enrollment\.created_by/)?.[0] || '';
  assert.ok(registryInsert, 'device registry insert must exist and bind the hashed token');
  assert.match(registryInsert, /tokenHash/);
  assert.doesNotMatch(registryInsert, /deviceToken/);
});

test('public device enrollment is edge-rate-limited through the shared security layer', () => {
  assert.match(security, /'\/api\/device-agent\/enroll'/);
  assert.match(entry, /enforceEdgeSecurity/);
  assert.match(security, /AUTH_RATE_LIMITER/);
});

test('cloud operations use a fixed capability allowlist and never expose arbitrary shell', () => {
  for (const command of commands) {
    assert.ok(api.includes(`'${command}'`), `API missing allowlisted command ${command}`);
    assert.ok(agent.includes(`'${command}'`), `Agent missing allowlisted command ${command}`);
  }
  assert.doesNotMatch(api, /shell\.exec|powershell\.exec|command\.script/);
  assert.match(agent, /arbitraryShell = \$false/);
  assert.match(agent, /screenCapture = \$false/);
  assert.match(agent, /credentialCollection = \$false/);
});

test('maintain and privileged actions require explicit admin confirmation', () => {
  assert.match(api, /DEVICE_COMMAND_CONFIRM_REQUIRED/);
  for (const command of ['autologon.open','maintenance.temp_cleanup','maintenance.safe_optimize','updates.install','startup.disable','startup.restore','profile.workstation.apply','profile.workstation.restore','agent.self_update']) {
    const escaped = command.replaceAll('.', '\\.');
    assert.match(api, new RegExp(`'${escaped}'[^\n]*confirm: true`));
  }
  assert.match(admin, /CONFIRM_MESSAGES/);
});

test('startup management accepts only opaque SHA-256 item ids from cloud', () => {
  assert.match(api, /\^\[a-f0-9\]\{64\}\$/);
  assert.match(agent, /\^\[a-f0-9\]\{64\}\$/);
  assert.match(agent, /Get-Sha256String/);
  assert.match(agent, /disabledItems/);
  assert.match(agent, /Load-StartupBackup/);
  assert.doesNotMatch(admin, /registryPath\s*:/);
  assert.doesNotMatch(admin, /filePath\s*:/);
});

test('autologon stays local and never sends a Windows password to EKODI', () => {
  assert.match(agent, /download\.sysinternals\.com\/files\/AutoLogon\.zip/);
  assert.match(agent, /Autologon 창을 로컬에서 열었습니다/);
  assert.doesNotMatch(agent, /DefaultPassword|DefaultUserName|AutoAdminLogon/);
  assert.doesNotMatch(admin, /password\s*:/i);
});

test('diagnostics avoid remote screen, keyboard and credential collection', () => {
  assert.match(agent, /Get-SystemSnapshot/);
  assert.match(agent, /Get-StorageSnapshot/);
  assert.match(agent, /Get-NetworkDiagnostic/);
  assert.match(agent, /Get-PrinterDiagnostic/);
  assert.match(agent, /Get-WindowsUpdateDiagnostic/);
  assert.doesNotMatch(agent, /GetAsyncKeyState|SetWindowsHookEx|BitBlt|CopyFromScreen|GetClipboard/i);
});

test('Windows Update install never triggers automatic reboot', () => {
  assert.match(agent, /Install-WindowsUpdates/);
  assert.match(agent, /자동 재부팅하지 않습니다/);
  assert.doesNotMatch(agent, /Restart-Computer|shutdown\.exe\s+\/r|shutdown\s+-r/i);
});

test('safe optimization is bounded to diagnostics and old temporary-file cleanup', () => {
  const safeOptimize = agent.match(/function Invoke-SafeOptimization[\s\S]*?function Write-InternetShortcut/)?.[0] || '';
  assert.match(safeOptimize, /Get-LightHealth/);
  assert.match(safeOptimize, /Clear-SafeTempFiles/);
  assert.match(safeOptimize, /Get-FullDiagnostic/);
  assert.match(safeOptimize, /beforeMinFreePct/);
  assert.match(safeOptimize, /afterMinFreePct/);
  assert.doesNotMatch(safeOptimize, /Install-WindowsUpdates|Disable-StartupItem|Invoke-PowerCfg|Set-ItemProperty|Restart-Computer/);
  assert.match(admin, /안전 최적화/);
  assert.match(admin, /시작프로그램·업데이트·전원·레지스트리·재부팅은 건드리지 않습니다/);
});

test('one-click device protocol is bounded to EKODI enrollment and official API', () => {
  assert.match(api, /ekodi-device:\/\/enroll\?code=/);
  assert.match(agent, /\$ProtocolScheme = 'ekodi-device'/);
  assert.match(agent, /\$AllowedApiBase = 'https:\/\/api\.ekodi\.kr'/);
  assert.match(agent, /\^EKD-\[A-F0-9\]\{20\}\$/);
  assert.match(admin, /launchProtocol/);
  assert.match(admin, /ekodi-device-bootstrap\.cmd/);
  assert.match(bootstrap, /-RegisterProtocol/);
  assert.match(bootstrap, /CommandAst/);
  assert.doesNotMatch(bootstrap, /EnrollmentCode/);
});

test('existing registered devices upgrade in place instead of creating duplicate enrollment', () => {
  assert.match(agent, /\$AgentVersion = '2\.2\.0'/);
  assert.match(agent, /Stop-ExistingAgentProcesses/);
  assert.match(agent, /Stop-ScheduledTask/);
  assert.match(agent, /Get-CimInstance Win32_Process/);
  assert.match(agent, /\$hadConfig = Test-Path \$ConfigPath/);
  assert.match(agent, /기존 EKODI 기기 등록과 토큰을 유지/);
});

test('agent self-update validates actual PowerShell command AST instead of raw guard text', () => {
  assert.match(agent, /Test-AgentSourceSafety/);
  assert.match(agent, /CommandAst/);
  assert.match(agent, /ParseInput/);
  assert.match(agent, /\('Invoke-' \+ 'Expression'\)/);
});

test('admin Device Control is lazy-loaded from authenticated production assets', () => {
  const assets = build.match(/const assets = \[[\s\S]*?\];/)?.[0] || '';
  assert.match(assets, /device-control-admin\.css/);
  assert.match(assets, /device-control-admin\.js/);
  assert.match(assets, /admin-menu-registry\.js/);
  assert.match(assets, /admin-sidebar\.js/);
  assert.match(assets, /admin-menu-runtime\.js/);
  assert.match(assets, /storage-admin\.css/);
  assert.match(assets, /storage-admin\.js/);
  assert.match(build, /ekodi-device-bootstrap\.cmd/);
  assert.match(build, /admin-demand-loader\.js/);
  assert.doesNotMatch(build, /data-ekodi-postauth=\"admin-compact\.js/);
});

test('Windows agent preserves reversible state before privileged changes', () => {
  assert.match(agent, /power-before-ekodi\.pow/);
  assert.match(agent, /powercfg\.exe \/export/);
  assert.match(agent, /Restore-PowerBackup/);
  assert.match(agent, /startup-backup\.json/);
  assert.match(agent, /workstation-profile\.json/);
  assert.match(agent, /profile\.workstation\.restore/);
});

test('Device health remains deterministic, typed and action-bounded', () => {
  assert.match(api, /function deviceHealth/);
  assert.match(api, /recommendations\.slice\(0, 6\)/);
  assert.match(api, /commandAllowedForDeviceType/);
  assert.match(admin, /운영 제안/);
  assert.doesNotMatch(api, /eval\(|new Function/);
});

test('hybrid execution uses an opt-in bounded queue with capacity-aware assignment', () => {
  assert.match(api, /CREATE TABLE IF NOT EXISTS device_execution_profiles/);
  assert.match(api, /enabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(api, /CREATE TABLE IF NOT EXISTS device_jobs/);
  assert.match(api, /ORDER BY priority DESC, requested_at ASC/);
  assert.match(api, /active_count ASC, r\.last_seen_at DESC/);
  assert.match(api, /attempts < 3/);
  assert.match(api, /기기 작업 실패로 재배정/);
  assert.match(api, /DEVICE_JOB_NOT_ALLOWED/);
  assert.match(api, /DEVICE_JOB_CONFIRM_REQUIRED/);
  assert.match(admin, /자동 작업 ON/);
  assert.match(admin, /자동 작업 배정/);
  assert.doesNotMatch(api, /shell\.exec|powershell\.exec|command\.script/);
});

test('Device Control collapses refresh storms and duplicate active work', () => {
  assert.match(admin, /const inFlightRequests = new Map\(\)/);
  assert.match(admin, /retry-after/);
  assert.match(admin, /MAX_GET_RETRIES = 2/);
  assert.match(admin, /loadDevicesPromise/);
  assert.match(admin, /POLL_INTERVAL_MS = 15000/);
  assert.match(api, /RECONCILE_MIN_INTERVAL_MS = 2500/);
  assert.match(api, /DUPLICATE_REQUEST_WINDOW_MS = 30 \* 1000/);
  assert.match(api, /async function reconcileJobsOnce/);
  assert.match(api, /async function ensureSchemaOnce/);
  assert.match(api, /deduplicated: true/);
  assert.match(api, /reconcileJobsOnce\(env, \{ force: true \}\)/);
});

test('portable computers and non-PC types are excluded from automatic execution nodes', () => {
  assert.match(agent, /Win32_Battery/);
  assert.match(agent, /Win32_ComputerSystem/);
  assert.match(agent, /Win32_SystemEnclosure/);
  assert.match(agent, /autoExecutionEligible = \(-not \$isPortable\)/);
  assert.match(api, /system\.autoExecutionEligible === true/);
  assert.match(api, /system\.isPortable === false/);
  assert.match(api, /normalizeDeviceType\(row\.device_type \|\| 'pc'\) === 'pc'/);
  assert.match(api, /PORTABLE_DEVICE_NOT_ELIGIBLE/);
  assert.match(api, /DEVICE_TYPE_NOT_AUTO_EXECUTABLE/);
  assert.match(admin, /노트북·휴대형 기기는 자동 작업 노드에서 제외/);
});

test('unified fleet types reduce authority by default', () => {
  for (const type of ['pc','pos','kiosk','tablet','sensor','robot','other']) assert.match(api, new RegExp(`${type}: Object\\.freeze`));
  assert.match(api, /DEVICE_TYPE_COMMAND_BLOCKED/);
  assert.match(api, /policyCancelled: true/);
  assert.match(api, /sensor:[\s\S]*allowedCommands: Object\.freeze\(\[\]\)/);
  assert.match(api, /robot:[\s\S]*allowedCommands: Object\.freeze\(\[\]\)/);
  assert.match(admin, /원격 작업/);
  assert.match(admin, /관찰 인벤토리 등록/);
});
