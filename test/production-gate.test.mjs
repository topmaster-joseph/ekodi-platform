import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/production-gate.yml', 'utf8');

test('production gate verifies current canonical admin shell routes without redirects', () => {
  assert.match(workflow, /https:\/\/admin\.ekodi\.kr\//);
  assert.match(workflow, /https:\/\/admin\.ekodi\.kr\/admin/);
  assert.match(workflow, /https:\/\/ekodi\.kr\/admin/);
  assert.match(workflow, /<title>EKODI Admin<\/title>/);
  assert.match(workflow, /admin-shell/);
  assert.match(workflow, /admin-fallback/);
  assert.match(workflow, /! grep -Fiq '\^location:'/);
  assert.doesNotMatch(workflow, /EKODI Control Center/);
});

test('production gate keeps retired control-center paths closed', () => {
  assert.match(workflow, /https:\/\/admin\.ekodi\.kr\/control-center\.html/);
  assert.match(workflow, /\[ "\$code" = '404' \]/);
  assert.match(workflow, /x-ekodi-route: admin-retired/);
  assert.match(workflow, /Not Found/);
});

test('production gate watches current admin source instead of retired control-center source', () => {
  assert.match(workflow, /'admin-shell\.html'/);
  assert.match(workflow, /'admin-authenticated-shell\.js'/);
  assert.doesNotMatch(workflow, /- 'control-center\.html'/);
  assert.doesNotMatch(workflow, /- 'control-center\.js'/);
});
