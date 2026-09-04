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
  assert.match(production, /https:\/\/admin\.ekodi\.kr\/admin/);
  assert.match(production, /https:\/\/ekodi\.kr\/admin/);
  assert.match(production, /admin-shell\.html/);
  assert.match(production, /admin-authenticated-shell\.js/);
  assert.match(production, /admin-fallback/);
  assert.match(production, /retired_code.*control-center\.html/);
  assert.match(production, /x-ekodi-route: admin-retired/);
  assert.match(production, /\[ "\$retired_code" = '404' \]/);
  assert.doesNotMatch(production, /admin-control-center/);
  assert.doesNotMatch(production, /control-center\.js/);
});

test('admin monitors use the same current shell marker', () => {
  for (const source of [http2, deploy, performance]) assert.match(source, /<title>EKODI Admin<\/title>/);
  assert.match(http2, /'admin-shell'/);
  assert.doesNotMatch(http2, /admin-control-center/);
});