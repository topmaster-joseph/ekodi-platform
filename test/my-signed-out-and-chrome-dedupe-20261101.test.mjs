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

test('switching My EKODI tabs never hides the page body (body carries data-home-panel)',()=>{
  const app=read('my/app.js');
  assert.match(app,/document\.body\.dataset\.homePanel=activeHomePanel/);
  assert.match(app,/querySelectorAll\('\[data-home-panel\]:not\(body\)'\)/);
  assert.doesNotMatch(app,/querySelectorAll\('\[data-home-panel\]'\)/);
});

test('one-glance tabs: sub-menu cards stay and the chosen section opens below; footer owns the copyright',()=>{
  const app=read('my/app.js');
  assert.match(app,/\[data-account-menu\]'\)\.forEach\(node=>\{node\.hidden=false\}\)/);
  assert.match(app,/\[data-account-nav\]'\)\.forEach\(node=>\{node\.hidden=true\}\)/);
  assert.match(app,/\[data-services-menu\]'\)\.forEach\(node=>\{node\.hidden=false\}\)/);
  assert.match(app,/if\(signedIn&&tab==='account'\)syncAccountTabs\(\);/);
  assert.match(read('my/index.html'),/class="my-footer-copyright">© EKODI \(에코디\)/);
  const points=read('my/points/index.html');
  assert.match(points,/class="topbar my-comfort-header"/);
  assert.match(points,/class="my-custom-footer"/);
  assert.match(points,/body data-ekodi-ui="USER"[^>]*class="my-subpage"/);
});
