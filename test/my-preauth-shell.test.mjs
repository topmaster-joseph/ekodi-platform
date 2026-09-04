import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('My EKODI keeps the unauthenticated surface minimal while public controls remain in the header',async()=>{
  const [html,css,app]=await Promise.all([read('my/index.html'),read('my/styles.css'),read('my/app.js')]);
  assert.match(html,/data-auth-state="pending"/);
  assert.match(html,/id="guestGate"/);
  assert.match(html,/id="guestAuthButton"/);
  assert.match(html,/data-ekodi-header-actions/);
  assert.match(css,/body\[data-auth-state="guest"\]>main/);
  assert.match(css,/body\[data-auth-state="member"\]>\.guest-gate/);
  assert.match(app,/function setAuthState\(\)/);
  assert.match(app,/document\.body\.dataset\.authState=state/);
  assert.match(app,/\$\('#guestAuthButton'\)/);
});

test('CCM MR is user-controlled and no longer uses an unrelated login gesture to start audio',async()=>{
  const player=await read('shell/ccm-mr-player.js');
  assert.match(player,/function boot\(\)\{\s*installButton\(\);\s*updateButton\(\);\s*\}/);
  assert.doesNotMatch(player,/function armGesture\(/);
  assert.doesNotMatch(player,/document\.addEventListener\('pointerdown',resume,true\)/);
  assert.match(player,/button\.addEventListener\('click',async\(\)=>\{[\s\S]*await startAudio\(\)/);
});

test('My header exposes a stable shared action container for language and MR controls on mobile',async()=>{
  const [html,css,language,player]=await Promise.all([read('my/index.html'),read('my/styles.css'),read('shell/user-language.js'),read('shell/ccm-mr-player.js')]);
  assert.match(html,/class="topbar-actions" data-ekodi-header-actions/);
  assert.match(css,/\.topbar-actions\{display:flex/);
  assert.match(language,/\[data-ekodi-header-actions\]/);
  assert.match(player,/\[data-ekodi-header-actions\]/);
});
