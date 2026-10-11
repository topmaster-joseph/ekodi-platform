import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../platform-maturity-admin.js', import.meta.url), 'utf8');

test('maturity panel only mounts once the Admin DOM exists', () => {
  assert.match(source, /function installMaturityAdmin\(\)/);
  assert.match(source, /if \(typeof document === 'undefined' \|\| document\.getElementById\(MODULE_ID\)\) return/);
  assert.match(source, /if \(!content \|\| !nav\)/);
  assert.match(source, /window\.addEventListener\('ekodi-admin-ready', installMaturityAdmin, \{ once:true \}\)/);
  assert.match(source, /document\.addEventListener\('DOMContentLoaded', installMaturityAdmin, \{ once:true \}\)/);
});

test('transient maturity session failures retain a hidden route with a bounded one-shot retry', () => {
  assert.match(source, /function deny\(\{ transient = false \} = \{\}\)/);
  assert.match(source, /panel\.hidden = true; panel\.classList\.add\('hidden-panel'\)/);
  assert.match(source, /if \(!transient && location\.hash\.toLowerCase\(\) === '#maturity'\)/);
  assert.match(source, /deny\(\{ transient:true \}\)/);
  assert.match(source, /if \(!sessionRetryAttempted\)/);
  assert.match(source, /sessionRetryAttempted = true/);
  assert.match(source, /window\.setTimeout\(\(\) => \{ if \(document\.contains\(panel\)\) void authorize\(\); \}, 1500\)/);
  assert.doesNotMatch(source, /while\s*\(!authorized\)/);
});

test('maturity can be re-shown only after server-confirmed super_admin authentication', () => {
  const success=source.indexOf("const session = await readSession()");
  const gate=source.indexOf("if (session?.role !== 'super_admin') return deny()",success);
  const grant=source.indexOf("authorized = true; root.dataset.ekodiMaturityAuthorized = 'true'",gate);
  const activate=source.indexOf("window.EKODIAdminPanels?.activate?.(SECTION)",grant);
  assert.ok(success>=0 && gate>success && grant>gate && activate>grant,
    'panel activation must follow session and role check');
  assert.match(source, /let authorizationInFlight = null/);
  assert.match(source, /if \(authorizationInFlight\) return authorizationInFlight/);
  assert.match(source, /if \(!authorized\) \{ void authorize\(\); return; \}/);
  assert.match(source, /nav\?\.querySelector\('\[data-section="maturity"\]'\)\?\.remove\(\)/);
});
