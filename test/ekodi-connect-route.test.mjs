import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('canonical /connect entry routes to central auth before workspace fallback', async () => {
  const [siteWorker,entryRouter]=await Promise.all([
    read('site-worker.js'),
    read('platform-router-entry-worker.js'),
  ]);
  for (const source of [siteWorker,entryRouter]) {
    assert.match(source, /pathname===?'\/connect'|pathname === '\/connect'/);
    assert.match(source, /new URL\('\/auth\/',\s*request\.url\)/);
    assert.match(source, /searchParams\.set\('site','ai'\)/);
    assert.match(source, /searchParams\.set\('return_to','https:\/\/ekodi\.kr\/ai\/'\)/);
    assert.match(source, /mcp-connect-auth/);
  }
  const connectRoute=entryRouter.indexOf("url.pathname==='/connect'");
  const workspaceFallback=entryRouter.indexOf("isPublicWorkspacePath(url.pathname)");
  assert.ok(connectRoute >= 0 && workspaceFallback > connectRoute, 'entry router must own /connect before generic workspace routing');
});
