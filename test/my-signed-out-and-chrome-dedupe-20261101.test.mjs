// My EKODI never shows to signed-out visitors; shared chrome never repeats itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('signed-out visitors are sent from My EKODI to central login, returning to the same page',()=>{
  const app=read('my/app.js');
  assert.match(app,/if\(!session\)\{redirectSignedOutToLogin\(\)\}else\{/);
  assert.match(app,/if\(!session\)\{redirectSignedOutToLogin\(\);return\}/,'signing out in another tab also leaves My EKODI');
  assert.match(app,/target\.searchParams\.set\('return_to',location\.origin\+location\.pathname\+location\.search\+location\.hash\)/);
  assert.match(app,/location\.replace\(signedOutLoginUrl\(\)\)/);
  const css=read('my/hub-shell.css');
  assert.match(css,/body\[data-auth-state="guest"\]>\*,body\[data-auth-state="redirect"\]>\*\{visibility:hidden!important\}/,'no guest flash before redirect');
  assert.match(read('my/index.html'),/<body[^>]*data-auth-state="guest"/,'page starts hidden until a session is confirmed');
});

test('shared footer does not repeat the brand as the operator name',async()=>{
  const {renderEkodiUserFooter}=await import('../config/user-footer.js');
  const {siteChromeDefaults}=await import('../config/site-chrome-defaults.js');
  const html=renderEkodiUserFooter(siteChromeDefaults('EKODI','https://ekodi.kr/').footer);
  assert.equal((html.match(/>EKODI</g)||[]).length,1,html);
  assert.match(read('shell/user-ui-footer.js'),/sameAsBrand/);
});

test('shared login chip stays out of headers that already have their own login',()=>{
  const src=read('shell/unified-user-auth.js');
  assert.match(src,/header\.querySelector\('\[data-ekodi-home-login\],\[data-ekodi-page-login\]'\)/);
  assert.match(read('index.html'),/data-ekodi-home-login/);
});
