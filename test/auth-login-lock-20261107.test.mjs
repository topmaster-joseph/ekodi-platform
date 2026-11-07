// Owner request 2026-11-07: one login channel at a time, bold in-progress message,
// every button back after a failure, and always return to the page the person came from.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('lock module disables every login control except cancel and shows a bold busy message',async()=>{
  const lock=read('auth-site/login-lock.js');
  assert.match(lock,/#signedOut button:not\(#cancelSignedOut\), #signedOut input, #signedOut select, \.federated-btn/);
  assert.match(lock,/status\.className = 'notice busy'/);
  const {busyMessage}=await import('../auth-site/login-lock.js');
  assert.equal(busyMessage('카카오'),'카카오 로그인 중입니다. 완료될 때까지 다른 로그인 버튼은 누를 수 없습니다.');
  const css=read('auth-site/auth.css');
  assert.match(css,/html\[data-ekodi-login-busy\] #googleButtonHost,html\[data-ekodi-login-busy\] #federatedButtonHost/);
  assert.match(css,/\.notice\.busy\{font-weight:800/);
});

test('every channel locks while signing in and unlocks on failure',()=>{
  const fed=read('auth-site/federated-login.js');
  assert.match(fed,/if \(purpose === 'login' && isLoginBusy\(\)\) return;/);
  assert.match(fed,/if \(purpose === 'login'\) unlockLogin\(\);/);
  assert.match(fed,/function fail\(text, restoreSearch\) \{\n  history\.replaceState[^\n]*\n  unlockLogin\(\);/);
  assert.match(fed,/다른 방법으로 다시 로그인/,'a failed Kakao/Naver attempt offers every channel again');
  const client=read('auth-site/client-auth.js');
  assert.match(client,/function showRetry\(message\)\{\n  routing=false;\n  unlockLogin\(\);/);
  assert.match(client,/lockLogin\('Google','Google 로그인 중입니다/);
  assert.match(client,/watchGoogleButton\(host,\(\)=>handlingCredential\)/);
  const hub=read('auth-site/auth.js');
  assert.match(hub,/routing=false;handlingGoogle=false;unlockLogin\(\);/);
  const email=read('auth-site/email-password.js');
  assert.match(email,/if\(signingIn&&isLoginBusy\(\)\)return;/);
  assert.match(email,/catch\(error\)\{if\(signingIn\)unlockLogin\(\);/);
});

test('login returns to the previous EKODI page even without return_to',()=>{
  const router=read('auth-site/auth-router.js');
  assert.match(router,/if\(!params\.get\('return_to'\)&&document\.referrer\)/);
  assert.match(router,/!from\.pathname\.startsWith\('\/auth'\)/);
  assert.match(router,/params\.set\('return_to',from\.href\)/);
  assert.match(read('scripts/build.mjs'),/'login-lock\.js'/);
  assert.match(read('canonical-surface-router.js'),/'\/login-lock\.js'/);
});
