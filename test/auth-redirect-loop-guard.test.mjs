import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const html=await readFile(new URL('auth-site/index.html',root),'utf8');
const bootstrap=await readFile(new URL('auth-site/auth-bootstrap.js',root),'utf8');

test('central auth blocks rapid repeated service handoff navigation',()=>{
  assert.match(bootstrap,/ekodi-auth-entry:/);
  assert.match(bootstrap,/now - previous < 120000/);
  assert.match(bootstrap,/authLoopBlocked/);
  assert.match(bootstrap,/반복 이동 차단/);
  assert.match(bootstrap,/sessionStorage\.removeItem\(guardKey\)/);
});

test('central auth loop guard does not block interactive management or reload recovery',()=>{
  assert.match(bootstrap,/const interactive = manageMode \|\| reviewMode/);
  assert.match(bootstrap,/navigationType !== 'reload'/);
  assert.match(bootstrap,/if \(!interactive\)/);
});

test('auth router starts only after the loop decision and retry opens a fresh flow',()=>{
  assert.doesNotMatch(html,/<script type="module" src="\/auth-router\.js/);
  assert.match(html,/src="\/auth-bootstrap\.js\?v=20260918-admin-login-1"/);
  assert.match(bootstrap,/await import\('\/auth-router\.js\?v=20260904-direct-login-1'\)/);
  assert.match(bootstrap,/retry\?\.addEventListener\('click'/);
  assert.ok(bootstrap.indexOf('if (repeated)') < bootstrap.indexOf('await startRouter()'));
});
