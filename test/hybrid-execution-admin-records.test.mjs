import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const admin = await readFile(new URL('../hybrid-execution-admin.js', import.meta.url), 'utf8');

test('device control exposes filterable execution records and event ledger', () => {
  assert.match(admin, /실행 인프라 · 작업 관제/);
  assert.match(admin, /id="hybridStatusFilter"/);
  assert.match(admin, /id="hybridJobSearch"/);
  assert.match(admin, /실행 상세 · 이벤트/);
  assert.match(admin, /id="hybridEventList"/);
  assert.match(admin, /data\.events/);
  assert.match(admin, /summary\.failedJobs/);
});

test('execution records state the metadata-only privacy boundary', () => {
  assert.match(admin, /입력한 문자·비밀번호·메시지 내용은 수집하지 않습니다/);
  assert.doesNotMatch(admin, /keydown|keypress|keyup|KeyboardEvent|event\.key/);
});

test('node status distinguishes EKODI-native heartbeat from remote desktop and shows missing timestamps', () => {
  assert.match(admin, /외부 원격제어 프로그램의 연결 상태와는 별개/);
  assert.match(admin, /EKODI Agent \$\{online\}/);
  assert.match(admin, /node\.lastHeartbeatAt \? timeLabel\(node\.lastHeartbeatAt\) : '미확인'/);
  assert.match(admin, /작업 완료 여부는 아래 실행 기록에서 확인하세요/);
});
