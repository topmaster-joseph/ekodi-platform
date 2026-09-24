import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('central Admin CSP permits canonical api.ekodi.kr control calls in Worker and static headers', async () => {
  const [worker, headers] = await Promise.all([
    read('site-worker.js'),
    read('_headers'),
  ]);

  const workerStart = worker.indexOf('const ADMIN_CSP = [');
  assert.ok(workerStart >= 0, 'ADMIN_CSP must exist');
  const workerCsp = worker.slice(workerStart, workerStart + 1600);
  assert.match(workerCsp, /connect-src[^\n]+https:\/\/api\.ekodi\.kr/);

  const adminBlocks = [...headers.matchAll(/\/admin(?:\/\*|\/)[\s\S]*?Content-Security-Policy:\s*([^\n]+)/g)];
  assert.ok(adminBlocks.length >= 2, 'both /admin/ and /admin/* CSP blocks must exist');
  for (const match of adminBlocks) {
    assert.match(match[1], /connect-src[^;]*https:\/\/api\.ekodi\.kr/);
  }
});
