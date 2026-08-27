import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const admin = await readFile(new URL('../hybrid-execution-admin.js', import.meta.url), 'utf8');

test('device control exposes filterable execution records and event ledger', () => {
  assert.match(admin, /기기 관리 · 실행 기록/);
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
