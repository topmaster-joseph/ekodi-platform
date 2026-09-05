import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/production-gate.yml', 'utf8');

test('production gate verifies current canonical admin shell routes without redirects', () => {
  assert.ok(workflow.includes("verify_admin 'https://admin.ekodi.kr/' 'admin-shell'"));
  assert.ok(workflow.includes("verify_admin 'https://admin.ekodi.kr/admin' 'admin-shell'"));
  assert.ok(workflow.includes("verify_admin 'https://ekodi.kr/admin' 'admin-fallback'"));
  assert.ok(workflow.includes("grep -Fq '<title>EKODI Admin</title>' /tmp/body"));
  assert.ok(workflow.includes("! grep -Fiq '^location:' /tmp/headers"));
  assert.ok(!workflow.includes('EKODI Control Center'));
});

test('production gate keeps retired control-center paths closed', () => {
  assert.ok(workflow.includes("verify_retired_admin 'https://admin.ekodi.kr/control-center.html'"));
  assert.ok(workflow.includes("[ \"$code\" = '404' ]"));
  assert.ok(workflow.includes("grep -Fiq 'x-ekodi-route: admin-retired' /tmp/headers"));
  assert.ok(workflow.includes("grep -Fq 'Not Found' /tmp/body"));
});

test('production gate watches current admin source instead of retired control-center source', () => {
  assert.ok(workflow.includes("      - 'admin-shell.html'"));
  assert.ok(workflow.includes("      - 'admin-authenticated-shell.js'"));
  assert.ok(!workflow.includes("      - 'control-center.html'"));
  assert.ok(!workflow.includes("      - 'control-center.js'"));
});
