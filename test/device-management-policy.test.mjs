import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const control = fs.readFileSync(new URL('../device-control.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../device-control-admin.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../device-control-admin.css', import.meta.url), 'utf8');

test('unified device catalog covers the supported fleet classes', () => {
  for (const type of ['pc', 'pos', 'kiosk', 'tablet', 'sensor', 'robot', 'other']) {
    assert.match(control, new RegExp(`${type}: Object\\.freeze`));
  }
  assert.match(control, /DEVICE_TYPE_POLICIES/);
  assert.match(control, /device_management_profiles/);
  assert.match(control, /device_inventory/);
  assert.match(control, /device_enrollment_profiles/);
});

test('only verified desktop PC type can enter automatic execution', () => {
  assert.match(control, /normalizeDeviceType\(row\.device_type \|\| 'pc'\) === 'pc'/);
  assert.match(control, /DEVICE_TYPE_NOT_AUTO_EXECUTABLE/);
  assert.match(control, /system\.isPortable === false/);
  assert.match(control, /autoExecution: 'desktop-only'/);
  assert.match(control, /sensor:[\s\S]*autoExecution: 'never'/);
  assert.match(control, /robot:[\s\S]*autoExecution: 'never'/);
});

test('POS kiosk tablet are observe-limited while sensor and robot have zero default remote commands', () => {
  assert.match(control, /pos:[\s\S]*allowedCommands: Object\.freeze\(\['diagnostics\.collect', 'network\.diagnose', 'printers\.diagnose', 'updates\.scan'\]\)/);
  assert.match(control, /kiosk:[\s\S]*allowedCommands: Object\.freeze\(\['diagnostics\.collect', 'network\.diagnose', 'updates\.scan'\]\)/);
  assert.match(control, /tablet:[\s\S]*allowedCommands: Object\.freeze\(\['diagnostics\.collect', 'network\.diagnose', 'updates\.scan'\]\)/);
  assert.match(control, /sensor:[\s\S]*allowedCommands: Object\.freeze\(\[\]\)/);
  assert.match(control, /robot:[\s\S]*allowedCommands: Object\.freeze\(\[\]\)/);
  assert.match(control, /DEVICE_TYPE_COMMAND_BLOCKED/);
  assert.match(control, /policyCancelled: true/);
});

test('administrator can inventory non-agent devices without granting remote control', () => {
  assert.match(control, /POST'[\s\S]*ADMIN_PREFIX}\/(?:inventory|enrollment)/);
  assert.match(control, /management_mode, location_label, notes/);
  assert.match(control, /VALUES \(\?, \?, \?, 'observe'/);
  assert.match(admin, /관찰 인벤토리 등록/);
  assert.match(admin, /등록만으로 원격제어 권한이 생기지 않습니다/);
  assert.match(admin, /전용 안전 어댑터/);
});

test('admin UI exposes type filters and management policy editing', () => {
  assert.match(admin, /REMOTE WORK & DEVICE MANAGEMENT/);
  assert.match(admin, /원격 작업/);
  assert.match(admin, /deviceTypeFilters/);
  assert.match(admin, /data-save-management/);
  assert.match(admin, /\/management`/);
  assert.match(admin, /데스크톱 PC가 아닌 기기는 자동 작업배정에서 제외/);
  assert.match(css, /\.device-type-filters/);
  assert.match(css, /\.device-management-row/);
  assert.match(css, /\.device-onboarding-grid/);
});
