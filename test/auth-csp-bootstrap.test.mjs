import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authIndex = await readFile(new URL('../auth-site/index.html', import.meta.url), 'utf8');
const authBootstrap = await readFile(new URL('../auth-site/auth-bootstrap.js', import.meta.url), 'utf8');
const authRouter = await readFile(new URL('../auth-site/auth-router.js', import.meta.url), 'utf8');
const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');

function executableInlineScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs, body]) => !/\bsrc\s*=/.test(attrs) && body.trim().length > 0);
}

test('central auth bootstraps without CSP-blocked inline JavaScript', () => {
  assert.equal(executableInlineScripts(authIndex).length, 0);
  assert.match(authIndex, /<script\s+type="module"\s+src="\/auth-bootstrap\.js\?v=20260918-admin-login-1"><\/script>/);
  assert.doesNotMatch(authIndex, /src="\/auth-router\.js/);
  assert.match(authBootstrap, /dataset\.adminDirectBridge\s*=\s*directAdmin\s*\?\s*'1'\s*:\s*'0'/);
  assert.match(authBootstrap, /ekodi-auth-entry:/);
  assert.match(authBootstrap, /await import\('\/auth-router\.js\?v=20260904-direct-login-1'\)/);
  assert.doesNotMatch(authRouter, /ekodi-auth-entry:/);
});

test('central auth loop decision precedes router start and retry opens a fresh flow', () => {
  const decision = authBootstrap.indexOf('if (repeated)');
  const routerImport = authBootstrap.indexOf("await import('/auth-router.js?v=20260904-direct-login-1')");
  const retryReset = authBootstrap.indexOf('sessionStorage.removeItem(guardKey)');
  const retryStart = authBootstrap.indexOf('await startRouter()', retryReset);

  assert.ok(decision >= 0, 'bootstrap must make the loop decision');
  assert.ok(routerImport >= 0, 'bootstrap must own router startup');
  assert.ok(retryReset >= 0, 'retry must clear the stale entry guard');
  assert.ok(retryStart > retryReset, 'retry must start the router only after clearing the stale guard');
  assert.match(authBootstrap, /navigationType\s*!==\s*'reload'/);
  assert.match(authBootstrap, /!interactive/);
  assert.doesNotMatch(authBootstrap, /location\.reload\(\)/);
});

test('central auth accepts only the canonical EKODI host for return navigation', () => {
  assert.match(authBootstrap, /url\.hostname\.toLowerCase\(\)\s*===\s*'ekodi\.kr'/);
  assert.match(authRouter, /hostname==='ekodi\.kr'/);
  assert.doesNotMatch(authBootstrap, /endsWith\('\.ekodi\.kr'\)/);
  assert.doesNotMatch(authRouter, /endsWith\('\.ekodi\.kr'\)/);
});

test('central auth CSP keeps JavaScript external-only', () => {
  const authCspBlock = siteWorker.match(/const AUTH_CSP = \[([\s\S]*?)\]\.join\('; '\);/);
  assert.ok(authCspBlock, 'AUTH_CSP must remain declared');
  const scriptDirective = authCspBlock[1].match(/"script-src ([^"]+)"/);
  assert.ok(scriptDirective, 'AUTH_CSP must declare script-src');
  assert.match(scriptDirective[1], /'self'/);
  assert.doesNotMatch(scriptDirective[1], /'unsafe-inline'/);
});
