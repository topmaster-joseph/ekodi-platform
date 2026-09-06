import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handleDeviceWakeControl, runWakeOrchestration } from '../device-wake-control.js';
import { disableIneligibleWakeProfiles, enforceDesktopWakeRequest } from '../device-wake-policy.js';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [wake, policy, entry, gateway, startup, bootstrap, admin, migration, wrangler] = await Promise.all([
  read('device-wake-control.js'), read('device-wake-policy.js'), read('mission-control-entry-worker.js'),
  read('tools/ekodi-device-agent/windows/ekodi-wake-gateway.ps1'),
  read('tools/ekodi-device-agent/windows/ekodi-device-startup.ps1'),
  read('ekodi-device-bootstrap.cmd'), read('device-wake-admin.js'),
  read('migrations/0046_device_wake_orchestration.sql'), read('wrangler.api.toml'),
]);

test('wake control exports compile and preserves canonical Control API entry', () => {
  assert.equal(typeof handleDeviceWakeControl, 'function');
  assert.equal(typeof runWakeOrchestration, 'function');
  assert.equal(typeof enforceDesktopWakeRequest, 'function');
  assert.equal(typeof disableIneligibleWakeProfiles, 'function');
  assert.match(entry, /handleDeviceWakeControl/);
  assert.match(entry, /runWakeOrchestration/);
  assert.match(entry, /enforceDesktopWakeRequest/);
  assert.match(wrangler, /main = "mission-control-entry-worker\.js"/);
});

test('wake control is admin-authorized and verified desktop-only', () => {
  assert.match(wake, /WAKE_CONFIRMATION_REQUIRED/);
  assert.match(wake, /DESKTOP_ONLY/);
  assert.match(policy, /autoExecutionEligible === true/);
  assert.match(policy, /isPortable === false/);
  assert.match(policy, /VERIFIED_DESKTOP_REQUIRED/);
  assert.match(policy, /disableIneligibleWakeProfiles/);
  assert.match(admin, /노트북\/휴대형 제외/);
  assert.match(admin, /system\.autoExecutionEligible === true/);
  assert.match(admin, /system\.isPortable === false/);
});

test('fully-off wake uses isolated gateway, not arbitrary shell', () => {
  assert.match(gateway, /Send-WakePacket/);
  assert.match(gateway, /UdpClient/);
  assert.match(gateway, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(gateway, /ServiceAccount/);
  assert.match(gateway, /Test-IsPortable/);
  assert.doesNotMatch(gateway, /Invoke-Expression|\biex\b/i);
});

test('device agent boot recovery starts before interactive login', () => {
  assert.match(startup, /EKODI Device Agent Boot/);
  assert.match(startup, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(startup, /-UserId 'SYSTEM'/);
  assert.match(startup, /WakeOnMagicPacket Enabled/);
  assert.match(startup, /Test-IsPortable/);
  assert.match(bootstrap, /ekodi-device-startup\.ps1/);
  assert.match(bootstrap, /-Install','-RunNow/);
});

test('queued work may auto-wake only persistently authorized devices', () => {
  assert.match(wake, /auto_wake_for_jobs=1/);
  assert.match(wake, /device_execution_profiles/);
  assert.match(wake, /status='queued'/);
  assert.match(wake, /resume_jobs/);
  assert.match(wake, /queued-job:/);
  assert.match(entry, /disableIneligibleWakeProfiles/);
});

test('wake state is durable, sequenced and observable', () => {
  for (const table of ['device_wake_gateway_enrollments','device_wake_gateways','device_wake_profiles','device_wake_requests']) {
    assert.match(migration, new RegExp(table));
  }
  assert.match(admin, /\/api\/control\/wake/);
  assert.match(admin, /Gateway 등록코드/);
  assert.match(admin, /지금 켜기/);
  assert.match(admin, /부팅 후 작업 계속/);
});
