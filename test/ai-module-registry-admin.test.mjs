import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [ui, css, loader, build, postbuild] = await Promise.all([
  readFile(new URL('../ai-module-registry-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../ai-module-registry-admin.css', import.meta.url), 'utf8'),
  readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/admin-performance-postbuild.mjs', import.meta.url), 'utf8'),
]);

test('external AI registry admin exposes register, validate, secret and lifecycle controls', () => {
  assert.match(ui, /External AI Module Registry/);
  assert.match(ui, /data-register-form/);
  assert.match(ui, /\/check/);
  assert.match(ui, /external-ai-module-secret-connect/);
  assert.match(ui, /external-ai-module-status-change/);
  assert.match(ui, /production/);
  assert.match(ui, /blocked/);
  assert.match(ui, /type=\"password\"/);
});