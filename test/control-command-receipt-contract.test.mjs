import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const control = readFileSync(new URL('../control.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../control.html', import.meta.url), 'utf8');

test('Control no longer inserts guaranteed auto-blocked Pulse jobs for general commands', () => {
  assert.doesNotMatch(control, /api\\/control\\/ai\\/v8\\/pulse/);
  assert.match(control, /actionType:'ui.change_request'/);
  assert.match(control, /area:'bounded_admin_change'/);
  assert.match(control, /preflightVerified:false/);
  assert.match(control, /api\\/control\\/ai\\/actions/);
  assert.match(control, /Promise\\.allSettled/);
});

test('read-only health verification is not promoted to arbitrary execution authority', () => {
  assert.match(control, /actionType:'service.health_check'/);
  assert.match(control, /healthReceipt\\?\\.status==='verified'/);
  assert.match(control, /명령 접수와 AI 답변은 코드 변경·배포 완료 증거가 아닙니다/);
  assert.match(control, /auto_blocked:'자동 실행 차단'/);
  assert.match(html, /작업 접수·사전점검/);
});

test('EKODI Control checks real API and administrator authority before showing connection', () => {
  assert.match(control, /api\\('\\/api\\/session'\\)/);
  assert.match(control, /session\\?\\.authenticated!==true\\|\\|session\\.role!=='super_admin'/);
  assert.match(control, /api\\('\\/api\\/control\\/ai\\/provider-status'\\)/);
  assert.match(control, /EKODI API 연결됨 · 실행 검증 별도/);
});
