import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('canonical /connect entry routes to central auth instead of a workspace fallback', async () => {
  const worker=await read('site-worker.js');
  assert.match(worker, /url\.pathname === '\/connect'/);
  assert.match(worker, /new URL\('\/auth\/', request\.url\)/);
  assert.match(worker, /target\.searchParams\.set\('site','ai'\)/);
  assert.match(worker, /target\.searchParams\.set\('return_to','https:\/\/ekodi\.kr\/ai\/'\)/);
  assert.match(worker, /X-EKODI-Route','mcp-connect-auth'/);
});
