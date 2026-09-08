import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');
const production = read('.github/workflows/production-gate.yml');
const http2 = read('.github/workflows/admin-http2-stability.yml');
const deploy = read('.github/workflows/deploy.yml');
const performance = read('.github/workflows/ecosystem-performance-watch.yml');

test('production verification follows the current Admin Shell contract', () => {
  assert.match(production, /x-ekodi-route: \$route/);
  assert.match(production, /<title>EKODI Admin<\/title>/);
  assert.match(production, /verify_admin 'https:\/\/ekodi\.kr\/admin\/' 'admin-shell'/);
  assert.match(production, /verify_redirect 'https:\/\/ekodi\.kr\/admin' 'https:\/\/ekodi\.kr\/admin\/'/);
  assert.match(production, /verify_redirect 'https:\/\/admin\.ekodi\.kr\/' 'https:\/\/ekodi\.kr\/admin\/\?source=admin\.ekodi\.kr'/);
  assert.match(production, /verify_redirect 'https:\/\/admin\.ekodi\.kr\/control-center\.html'/);
  assert.match(production, /admin-shell\.html/);
  assert.match(production, /admin-authenticated-shell\.js/);
  assert.doesNotMatch(production, /admin-fallback/);
  assert.doesNotMatch(production, /x-ekodi-route: admin-retired/);
  assert.doesNotMatch(production, /admin-control-center/);
  assert.doesNotMatch(production, /control-center\.js/);
});

test('admin monitors use the same current shell marker', () => {
  for (const source of [http2, deploy, performance]) assert.match(source, /<title>EKODI Admin<\/title>/);
  assert.match(http2, /'admin-shell'/);
  assert.doesNotMatch(http2, /admin-control-center/);
});