// EKODI-STATUS-RATE-WAIT-001
//
// 측정 2026-11-12, 복구 PR #9461의 오케스트레이션 게이트:
//
//   [EKODI GitHub] {"status":403,"classification":"primary_rate_limit",
//                   "resource":"core","remaining":0,"limit":5000,"resetAt":...}
//   [EKODI GitHub] fail closed: HTTP 403, curl rc=22
//
// 테스트는 전부 통과했고 상태 게시 한 단계만 실패했다. 그리고 그 실패는 돌아올
// 시각을 손에 쥐고 일어났다. 릴리스는 주차됐다.
//
// 그래서 한 번만 기다린다. 단, 응답이 스스로 "언제 오라"고 말할 때만 —
// retry-after 나 x-ratelimit-reset 이 있고 그 값이 상한 안일 때만이다. 헤더가
// 없으면 기다리지 않는다: 지연을 추측하면 명확한 거부가 조용한 정체로 바뀐다.
// 권한 403 은 어떤 경우에도 기다리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../scripts/github-status-transient.sh', import.meta.url));
const SOURCE = readFileSync(new URL('../scripts/github-status-transient.sh', import.meta.url), 'utf8');

// 기존 test/github-status-transient-retry.test.mjs 의 하네스를 그대로 쓰고,
// 가짜 curl 이 돌아올 시각을 알려주는 헤더를 낼 수 있게만 넓혔다.
function simulate(codes, { quota = false, resetIn = null, retryAfter = null, cap = 3, twoCalls = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ekodi-rate-wait-'));
  try {
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const sequence = join(dir, 'codes'), hits = join(dir, 'hits');
    writeFileSync(sequence, codes.join('\n') + '\n'); writeFileSync(hits, '');
    const fake = [
      '#!/usr/bin/env bash', 'set -euo pipefail',
      'body=""', 'headers=""',
      'while [[ $# -gt 0 ]]; do',
      '  if [[ "$1" == "-o" ]]; then body="$2";shift 2;continue;fi',
      '  if [[ "$1" == "-D" ]]; then headers="$2";shift 2;continue;fi',
      '  shift', 'done',
      'n=$(wc -l < "$FAKE_HITS")', 'i=$((n+1))',
      'code=$(head -n "$i" "$FAKE_CODES" | tail -n 1)',
      'echo "$code" >> "$FAKE_HITS"',
      'if [[ -n "$headers" ]]; then',
      '  : > "$headers"',
      '  if [[ "${FAKE_QUOTA:-0}" == 1 ]]; then printf "x-ratelimit-remaining: 0\\r\\n" >> "$headers"; fi',
      '  if [[ -n "${FAKE_RESET_IN:-}" ]]; then printf "x-ratelimit-reset: %s\\r\\n" "$(( $(date -u +%s) + FAKE_RESET_IN ))" >> "$headers"; fi',
      '  if [[ -n "${FAKE_RETRY_AFTER:-}" ]]; then printf "retry-after: %s\\r\\n" "$FAKE_RETRY_AFTER" >> "$headers"; fi',
      'fi',
      'if [[ "$code" =~ ^2 ]]; then',
      '  printf \'{"merge_commit_sha":"verified"}\' > "$body"',
      '  printf "%s" "$code"', '  exit 0', 'fi',
      'printf \'{"message":"denied"}\' > "$body"',
      'printf "%s" "$code"', 'exit 22',
    ].join('\n') + '\n';
    const fakePath = join(bin, 'curl'); writeFileSync(fakePath, fake); chmodSync(fakePath, 0o755);
    const command = twoCalls
      ? 'source "$1"; curl -sS https://api.github.com/x >/dev/null || :; curl -sS https://api.github.com/x >/dev/null'
      : 'source "$1"; curl -sS https://api.github.com/x';
    const started = Date.now();
    const result = spawnSync('bash', ['-c', command, 'bash', helper], {
      encoding: 'utf8', timeout: 30000,
      env: {
        ...process.env, PATH: bin + ':' + process.env.PATH,
        FAKE_HITS: hits, FAKE_CODES: sequence,
        FAKE_QUOTA: quota ? '1' : '0',
        FAKE_RESET_IN: resetIn === null ? '' : String(resetIn),
        FAKE_RETRY_AFTER: retryAfter === null ? '' : String(retryAfter),
        EKODI_STATUS_RATE_WAIT_CAP_S: String(cap),
        RUNNER_TEMP: twoCalls ? dir : '', GITHUB_ACTIONS: 'false', GITHUB_STEP_SUMMARY: '',
        GITHUB_RUN_ID: twoCalls ? '1' : '', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: twoCalls ? 'test' : '',
      },
    });
    return {
      code: result.status, stdout: result.stdout, stderr: result.stderr,
      elapsedMs: Date.now() - started,
      calls: readFileSync(hits, 'utf8').trim().split('\n').filter(Boolean),
    };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// 결정 함수는 따로 직접 부른다 — 경계값을 기다리지 않고 확인할 수 있다.
function waitSeconds(headerLines, cap = 150) {
  const dir = mkdtempSync(join(tmpdir(), 'ekodi-wait-'));
  try {
    const file = join(dir, 'headers');
    writeFileSync(file, headerLines.map(line => line + '\r\n').join(''));
    const out = spawnSync('bash', ['-c',
      `source "$1"; ekodi_github_status_wait_seconds "$2" "$3"`, 'bash', helper, file, String(cap)],
      { encoding: 'utf8', timeout: 10000 });
    return out.stdout.trim();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('돌아올 시각이 있고 상한 안이면 한 번 기다린 뒤 한 번 재시도한다', () => {
  const x = simulate([403, 200], { quota: true, resetIn: -1, cap: 5 });
  assert.equal(x.code, 0, x.stderr);
  assert.deepEqual(x.calls, ['403', '200'], '기다린 뒤 정확히 한 번 더 부른다');
  assert.match(x.stderr, /quota_primary resets in \d+s; waiting once then retrying once/);
  assert.match(x.stdout, /merge_commit_sha/);
});

test('429는 retry-after를 따른다', () => {
  const x = simulate([429, 200], { retryAfter: 1, cap: 5 });
  assert.equal(x.code, 0, x.stderr);
  assert.deepEqual(x.calls, ['429', '200']);
  assert.match(x.stderr, /rate_limited_429 resets in 1s/);
});

test('기다림은 한 번뿐이다 — 두 번째도 거부면 닫는다', () => {
  const x = simulate([403, 403, 200], { quota: true, resetIn: -1, cap: 5 });
  assert.notEqual(x.code, 0);
  assert.deepEqual(x.calls, ['403', '403'], '세 번째 호출은 없어야 한다');
  assert.doesNotMatch(x.stdout, /merge_commit_sha/);
  assert.match(x.stderr, /fail closed: HTTP 403/);
});

test('상한을 넘는 복구 시각이면 기다리지 않고 오늘처럼 닫는다', () => {
  const x = simulate([403, 200], { quota: true, resetIn: 3600, cap: 3 });
  assert.notEqual(x.code, 0);
  assert.deepEqual(x.calls, ['403'], '한 시간을 기다리며 작업을 붙잡지 않는다');
  assert.ok(x.elapsedMs < 20000, '즉시 닫혀야 한다');
  assert.doesNotMatch(x.stderr, /waiting once/);
});

test('돌아올 시각을 말하지 않으면 기다리지 않는다', () => {
  // 지연을 추측하면 명확한 거부가 조용한 정체로 바뀐다.
  const x = simulate([403, 200], { quota: true, cap: 5 });
  assert.notEqual(x.code, 0);
  assert.deepEqual(x.calls, ['403']);
  assert.doesNotMatch(x.stderr, /waiting once/);
});

test('권한 403은 복구 시각이 있어도 절대 기다리지 않는다', () => {
  // 한도가 아니라 권한이다. 기다려도 돌아오지 않는다.
  const x = simulate([403, 200], { quota: false, resetIn: -1, cap: 5, twoCalls: false });
  assert.notEqual(x.code, 0);
  assert.deepEqual(x.calls, ['403'], '권한 거부는 재시도 대상이 아니다');
  assert.doesNotMatch(x.stderr, /waiting once/);
  assert.match(x.stderr, /fail closed/);
});

for (const status of [401, 422]) {
  test(`HTTP ${status}는 복구 시각이 있어도 기다리지 않는다`, () => {
    const x = simulate([status, 200], { resetIn: -1, retryAfter: 1, cap: 5 });
    assert.notEqual(x.code, 0);
    assert.deepEqual(x.calls, [String(status)]);
    assert.doesNotMatch(x.stderr, /waiting once/);
  });
}

test('결정 함수의 경계', () => {
  assert.equal(waitSeconds(['retry-after: 7'], 150), '7');
  assert.equal(waitSeconds(['retry-after: 7'], 5), '', '상한을 넘으면 기다리지 않는다');
  assert.equal(waitSeconds([], 150), '', '헤더가 없으면 기다리지 않는다');
  assert.equal(waitSeconds(['x-ratelimit-remaining: 0'], 150), '', '남은 수량만으로는 시각을 모른다');
  assert.equal(waitSeconds(['x-ratelimit-reset: 1'], 150), '1', '이미 지난 시각은 1초로 좁힌다');
  assert.equal(waitSeconds(['x-ratelimit-reset: not-a-number'], 150), '', '숫자가 아니면 기다리지 않는다');
  // retry-after 가 있으면 그것이 우선한다 — 서버가 직접 말한 값이다.
  const both = waitSeconds(['retry-after: 4', `x-ratelimit-reset: ${Math.floor(Date.now() / 1000) + 99}`], 150);
  assert.equal(both, '4');
});

test('상한은 환경에서 조정되지만 엉뚱한 값은 기본값으로 떨어진다', () => {
  assert.equal(waitSeconds(['retry-after: 200'], 999), '200');
  for (const bad of ['', 'abc', '-5', '99999']) {
    assert.equal(waitSeconds(['retry-after: 200'], bad), '', `상한 ${JSON.stringify(bad)} 는 기본 150으로 떨어져 200초를 거절한다`);
  }
});

test('기다림이 fail-closed 설계를 대신하지 않는다', () => {
  // 성공 상태를 만들어내지 않고, 회로차단과 비밀 미기록 규칙도 그대로다.
  assert.match(SOURCE, /waited=0/, '한 번만 기다리는 상태값이 있어야 한다');
  assert.match(SOURCE, /\$\{EKODI_STATUS_RATE_WAIT_CAP_S:-150\}/, '상한이 있어야 한다');
  assert.doesNotMatch(SOURCE, /git push|merge_method|update-branch|workflow_dispatch/);
  // 대기 분기는 한도로 분류된 것에만 걸린다.
  const branch = SOURCE.slice(SOURCE.indexOf('if [[ "$waited" -eq 0 ]]'), SOURCE.indexOf('ekodi_github_status_note "$status_kind"'));
  for (const kind of ['quota_primary', 'quota_secondary', 'rate_limited_429']) {
    assert.ok(branch.includes(kind), `${kind} 는 대기 대상이어야 한다`);
  }
  for (const kind of ['permission_denied', 'authentication_denied', 'validation_denied', 'transport_error']) {
    assert.ok(!branch.includes(kind), `${kind} 는 대기 대상이 아니어야 한다`);
  }
});
