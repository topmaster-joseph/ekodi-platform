import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const html=await readFile(new URL('auth-site/index.html',root),'utf8');

test('central auth blocks rapid repeated service handoff navigation',()=>{
  assert.match(html,/ekodi-auth-entry:/);
  assert.match(html,/now-previous<120000/);
  assert.match(html,/authLoopBlocked/);
  assert.match(html,/반복 이동 차단/);
  assert.match(html,/sessionStorage\.removeItem\(guardKey\)/);
});

test('central auth loop guard does not block interactive management or reload recovery',()=>{
  assert.match(html,/const interactive=params\.get\('manage'\)==='1'\|\|params\.get\('review'\)==='1'/);
  assert.match(html,/navigationType!=='reload'/);
  assert.match(html,/if\(!interactive\)/);
});

test('auth router is loaded only after loop decision and retry can start a fresh flow',()=>{
  assert.doesNotMatch(html,/src="\/auth-router\.js\?v=/);
  assert.match(html,/await import\('\/auth-router\.js\?v=20260904-direct-login-1'\)/);
  assert.match(html,/retry\?\.addEventListener\('click'/);
});
