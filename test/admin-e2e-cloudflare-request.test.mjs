import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../scripts/admin-e2e-cloudflare-request.sh', import.meta.url));
const workflows = [
  fileURLToPath(new URL('../.github/workflows/admin-authenticated-e2e.yml', import.meta.url)),
  fileURLToPath(new URL('../.github/workflows/verify-admin-authenticated-production-e2e.yml', import.meta.url)),
];

const mockShell = String.raw`
set -euo pipefail
source "$EKODI_REQUEST_SCRIPT"
ekodi_cf_initialize
curl() {
  local output=''
  while (( $# )); do
    case "$1" in
      --output) output="$2"; shift 2;;
      --write-out) shift 2;;
      *) shift;;
    esac
  done
  printf x >> "$EKODI_TEST_COUNT"
  printf '%s' "$EKODI_TEST_PAYLOAD" > "$output"
  printf '%s' "$EKODI_TEST_STATUS"
}
first=0
ekodi_cf_request 'https://example.invalid/first' >/dev/null || first=$?
# Simulate the separate cleanup step re-sourcing and initializing the helper in the same job.
ekodi_cf_initialize
second=0
ekodi_cf_request 'https://example.invalid/second' >/dev/null || second=$?
if [[ -f "$EKODI_CF_QUOTA_FLAG" ]]; then state=open; else state=clear; fi
printf 'first=%s second=%s state=%s calls=%s\n' "$first" "$second" "$state" "$(wc -c < "$EKODI_TEST_COUNT")"
`;

function fixture(status, payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-cf-e2e-'));
  const count = path.join(dir, 'count');
  fs.writeFileSync(count, '');
  try {
    const processResult = spawnSync('bash', ['-c', mockShell], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: dir,
        GITHUB_RUN_ID: 'synthetic-6817',
        GITHUB_JOB: 'unit',
        EKODI_REQUEST_SCRIPT: helper,
        EKODI_TEST_COUNT: count,
        EKODI_TEST_STATUS: String(status),
        EKODI_TEST_PAYLOAD: payload,
      },
    });
    assert.equal(processResult.status, 0, processResult.stderr);
    return { stdout: processResult.stdout, stderr: processResult.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('Cloudflare first HTTP 429 opens a persistent circuit and makes exactly one curl call', () => {
  const { stdout, stderr } = fixture(429, '{"success":false,"errors":[{"code":1027}]}');
  assert.match(stdout, /first=75 second=75 state=open calls=1/);
  assert.match(stderr, /CF-QUOTA-001/);
});

test('Cloudflare error code 1027 also stops after one call even with an HTTP 200 wrapper', () => {
  const { stdout } = fixture(200, '{"success":false,"errors":[{"code":1027}]}');
  assert.match(stdout, /first=75 second=75 state=open calls=1/);
});

test('Cloudflare normal authorized responses pass through without opening the circuit', () => {
  const { stdout } = fixture(200, '{"success":true,"result":[]}');
  assert.match(stdout, /first=0 second=0 state=clear calls=2/);
});

test('Cloudflare non-quota errors remain failures rather than hidden successful responses', () => {
  const { stdout } = fixture(403, '{"success":false}');
  assert.match(stdout, /first=22 second=22 state=clear calls=2/);
});

test('both authenticated Admin workflows use the same offline-proven first-429 guard', () => {
  const helperText = fs.readFileSync(helper, 'utf8');
  assert.match(helperText, /curl -sS --retry 0 --output/);
  assert.match(helperText, /ekodi_cf_assert_clean \|\| return 75/);
  assert.match(helperText, /EKODI_CF_QUOTA_FLAG/);
  const syntax = spawnSync('bash', ['-n', helper], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  for (const file of workflows) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal((source.match(/source scripts\/admin-e2e-cloudflare-request\.sh/g) || []).length, 2);
    assert.equal((source.match(/ekodi_cf_assert_clean/g) || []).length, 2);
    assert.doesNotMatch(source, /curl -fsS --retry 2 --retry-delay 1/);
    assert.match(source, /session=\$\(ekodi_cf_request 'https:\/\/ekodi\.kr\/api\/session'/);
    const cleanupExport = source.indexOf('echo "E2E_TOKEN_HASH=$token_hash" >> "$GITHUB_ENV"');
    const sessionCheck = source.indexOf("session=$(ekodi_cf_request 'https://ekodi.kr/api/session'");
    assert.ok(cleanupExport > 0 && cleanupExport < sessionCheck, 'session identity is exported before validation failures');
    assert.match(source, /- name: Revoke short-lived E2E session[\s\S]*?if: always\(\)/);
  }
});
