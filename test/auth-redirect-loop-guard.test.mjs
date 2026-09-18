import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const html=await readFile(new URL('auth-site/index.html',root),'utf8');
const entry=await readFile(new URL('auth-site/auth-entry.js',root),'utf8');

test('central auth blocks rapid repeated service handoff navigation',()=>{
  assert.match(entry,/ekodi-auth-entry:/);
  assert.match(entry,/now - previous < 120000/);
  assert.match(entry,/authLoopBlocked/);
  assert.match(entry,/반복 이동 차단/);
  assert.match(entry,/sessionStorage\.removeItem\(guardKey\)/);
});

test('central auth loop guard does not block interactive management or reload recovery',()=>{
  assert.match(entry,/const interactive = params\.get\('manage'\) === '1' \|\| params\.get\('review'\) === '1'/);
  assert.match(entry,/navigationType !== 'reload'/);
  assert.match(entry,/if \(!interactive\)/);
});

test('auth router starts only after the loop decision and retry opens a fresh flow',()=>{
  assert.doesNotMatch(html,/<script type="module" src="\/auth-router\.js/);
  assert.match(html,/<script type="module" src="\/auth-entry\.js\?v=20260918-csp-bootstrap-1"><\/script>/);
  assert.match(entry,/return import\('\.\/auth-router\.js\?v=20260918-csp-bootstrap-1'\)/);
  assert.match(entry,/retry\?\.addEventListener\('click'/);
});
