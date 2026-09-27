import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('production browser auth uses only the canonical apex API boundary', async () => {
  const [client, site, auth] = await Promise.all([
    read('script.js'),
    read('site-worker.js'),
    read('auth-worker-core.js'),
  ]);
  assert.match(client, /const AUTH_API = 'https:\/\/ekodi\.kr';/);
  assert.doesNotMatch(client, /ekodi-auth-api\.topmaster-joseph\.workers\.dev/);
  assert.doesNotMatch(site, /connect-src[^\n]*ekodi-auth-api\.topmaster-joseph\.workers\.dev/);
  assert.match(auth, /const DEFAULT_ALLOWED_ORIGIN = 'https:\/\/ekodi\.kr';/);
  assert.doesNotMatch(auth, /DEFAULT_ALLOWED_ORIGIN = 'https:\/\/shy-thunder-39a4\.topmaster-joseph\.workers\.dev'/);
});
