import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(
  new URL('../.github/workflows/production-gate.yml', import.meta.url),
  'utf8',
);

test('Production Revenue Gate follows the canonical Admin redirect contract', () => {
  assert.match(workflow, /verify_redirect 'https:\/\/admin\.ekodi\.kr\/' 'https:\/\/ekodi\.kr\/admin\/\?source=admin\.ekodi\.kr'/);
  assert.match(workflow, /verify_redirect 'https:\/\/admin\.ekodi\.kr\/admin' 'https:\/\/ekodi\.kr\/admin\/\?source=admin\.ekodi\.kr'/);
  assert.match(workflow, /verify_redirect 'https:\/\/ekodi\.kr\/admin' 'https:\/\/ekodi\.kr\/admin\/'/);
  assert.match(workflow, /verify_admin 'https:\/\/ekodi\.kr\/admin\/'/);
  assert.match(workflow, /x-ekodi-route: admin-shell/);
});

test('Production Revenue Gate does not require legacy Admin hosts to serve the shell directly', () => {
  assert.doesNotMatch(workflow, /verify_admin 'https:\/\/admin\.ekodi\.kr\//);
  assert.doesNotMatch(workflow, /ADMIN RETIRED/);
  assert.doesNotMatch(workflow, /admin-fallback/);
});
