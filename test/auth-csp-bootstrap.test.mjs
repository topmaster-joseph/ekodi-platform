import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authIndex = await readFile(new URL('../auth-site/index.html', import.meta.url), 'utf8');
const authRouter = await readFile(new URL('../auth-site/auth-router.js', import.meta.url), 'utf8');
const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');

function executableInlineScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs, body]) => !/\bsrc\s*=/.test(attrs) && body.trim().length > 0);
}

test('central auth bootstraps without CSP-blocked inline JavaScript', () => {
  assert.equal(executableInlineScripts(authIndex).length, 0);
  assert.match(authIndex, /<script\s+type="module"\s+src="\/auth-router\.js\?v=20260904-direct-login-1"><\/script>/);
  assert.match(authRouter, /dataset\.adminDirectBridge=directAdmin\?'1':'0'/);
  assert.match(authRouter, /ekodi-auth-entry:/);
  assert.match(authRouter, /location\.reload\(\)/);
});

test('central auth CSP keeps JavaScript external-only', () => {
  const authCspBlock = siteWorker.match(/const AUTH_CSP = \[([\s\S]*?)\]\.join\('; '\);/);
  assert.ok(authCspBlock, 'AUTH_CSP must remain declared');
  const scriptDirective = authCspBlock[1].match(/"script-src ([^"]+)"/);
  assert.ok(scriptDirective, 'AUTH_CSP must declare script-src');
  assert.match(scriptDirective[1], /'self'/);
  assert.doesNotMatch(scriptDirective[1], /'unsafe-inline'/);
});
