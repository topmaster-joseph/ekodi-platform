import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../control.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../control.html',import.meta.url),'utf8');
const style=readFileSync(new URL('../control.css',import.meta.url),'utf8');

test('Control boot confirms a server-side super-admin session, never just token presence',()=>{
  assert.match(source,/await api\('\/api\/session'\)/);
  assert.match(source,/session\?\.authenticated===true && session\?\.role==='super_admin'/);
  assert.doesNotMatch(source,/const logged=Boolean\(token\(\)\)/);
  assert.match(source,/if\(!\(await verifySession\(\)\)\)/);
  assert.match(html,/id="authBanner"/);
  assert.match(html,/href="\/admin\/"/);
});

test('standing-delegation preflight comes from a verified health-check response',()=>{
  assert.match(source,/actionType:'service\.health_check'/);
  assert.match(source,/area:'health_checks'/);
  assert.match(source,/checked\?\.status==='verified' && checked\?\.execution\?\.ok===true/);
  assert.match(source,/if\(!preflight\)/);
  assert.match(source,/preflightVerified:preflight/);
  assert.doesNotMatch(source,/preflightVerified:true,verificationDefined:true/);
  assert.match(source,/자동실행을 접수하지 않았습니다/);
});

test('Control keeps the command, result, and browser surface readable',()=>{
  assert.match(source,/goal:message/);
  assert.match(source,/JSON\.stringify\(\{message,history:prior,context:/);
  assert.match(source,/pushMessage\('user',message/);
  assert.match(source,/state\.results\.unshift/);
  assert.match(style,/\.turn\.user \.bubble\{background:#efefef;color:#111\}/);
  assert.match(style,/\.turn\.assistant \.bubble\{color:#111\}/);
  assert.doesNotThrow(()=>new Function(source));
});
