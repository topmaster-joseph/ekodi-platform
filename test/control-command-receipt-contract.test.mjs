import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const control = readFileSync(new URL('../control.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../control.html', import.meta.url), 'utf8');

test('Control no longer inserts guaranteed auto-blocked Pulse jobs for general commands', () => {
  assert.ok(!control.includes("api('/api/control/ai/v8/pulse'"));
  assert.ok(control.includes("actionType:'ui.change_request'"));
  assert.ok(control.includes("area:'bounded_admin_change'"));
  assert.ok(control.includes("preflightVerified:false"));
  assert.ok(control.includes("api('/api/control/ai/actions'"));
  assert.ok(control.includes("Promise.allSettled"));
});

test('read-only health verification is not promoted to arbitrary execution authority', () => {
  assert.ok(control.includes("actionType:'service.health_check'"));
  assert.ok(control.includes("healthReceipt?.status==='verified'"));
  assert.ok(control.includes('명령 접수와 AI 답변은 코드 변경·배포 완료 증거가 아닙니다'));
  assert.ok(control.includes("auto_blocked:'자동 실행 차단'"));
  assert.ok(html.includes('작업 접수·사전점검'));
});

test('EKODI Control checks real API and administrator authority before showing connection', () => {
  assert.ok(control.includes("api('/api/session')"));
  assert.ok(control.includes("session?.authenticated!==true||session.role!=='super_admin'"));
  assert.ok(control.includes("api('/api/control/ai/provider-status')"));
  assert.ok(control.includes('EKODI API 연결됨 · 실행 검증 별도'));
});

test('Shared Site Core release verifies the new Control Action route without erasing legacy Assist probes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
  const requests = manifest.worker?.requests || manifest.requests || [];
  const control = requests.find(item => item.url === 'https://ekodi.kr/control.js');
  assert.ok(control, 'Control JS deployment probe must exist');
  assert.ok(control.expect.includes('/api/control/ai/actions'));
  assert.ok(control.expect.includes('/api/control/ai/assist'));
  assert.ok(!control.expect.includes('/api/control/ai/v8/pulse'), 'Removed Pulse is not used by new Control');
  const lazy = requests.find(item => item.url === 'https://ekodi.kr/admin/admin-lazy-features.js?assist=v2');
  assert.ok(lazy?.expect.includes('/api/control/ai/v8/pulse'), 'Unrelated Admin Assist probe stays intact');
});
