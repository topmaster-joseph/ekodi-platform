import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {EKODI_SERVICE_MANIFEST} from '../ekodi-service-manifest.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('all registered EKODI user services explicitly inherit canonical shared authentication',()=>{
  assert.ok(EKODI_SERVICE_MANIFEST.services.length>=37);
  for(const service of EKODI_SERVICE_MANIFEST.services){
    assert.equal(service.sso,true,service.id);
    assert.equal(service.unifiedAuth?.requiredForUserPages,true,service.id);
    assert.equal(service.unifiedAuth?.entry,'https://ekodi.kr/auth/',service.id);
    assert.equal(service.unifiedAuth?.publicViewingRequiresLogin,false,service.id);
    assert.equal(service.unifiedAuth?.servicePermissionsServerVerified,true,service.id);
    assert.equal(service.unifiedAuth?.maxVisibleNameCharacters,12,service.id);
  }
});

test('bundled shared shell serves the user login component on public and workspace surfaces',async()=>{
  const worker=await read('ekodi-shell-worker.js');
  const source=await read('shell/unified-user-auth.js');
  new Script(source,{filename:'shell/unified-user-auth.js'});
  assert.match(worker,/unifiedAuthUrl\.pathname='\/unified-user-auth\.js'/);
  assert.match(worker,/\$\{linkCompat\}\\n\$\{unifiedAuth\}\\n/);
  assert.match(worker,/x-ekodi-unified-user-auth/);
  assert.match(source,/EKODIUserUIHeader\?\.getState\?\.\(\)\.enabled!==true/);
  assert.match(source,/login\.origin|location\.origin\+location\.pathname\+location\.search/);
  assert.match(source,/shortName\(display\)/);
  assert.match(source,/chars\.length>12/);
  assert.match(source,/profile-api\/me/);
  assert.doesNotMatch(source,/localStorage\.setItem|sessionStorage\.setItem|document\.cookie=/);
  assert.doesNotMatch(source,/service_role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test('registration enforces one Person but does not imply tenant, billing, or platform admin entitlement',async()=>{
  const manifest=await read('ekodi-service-manifest.js');
  const boundary=await read('docs/auth/EKODI-ID-LOGIN-CHANNEL-BOUNDARY.md');
  assert.match(manifest,/identityProvider:'google'/);
  assert.match(manifest,/authHub:'https:\/\/ekodi\.kr\/auth\/'/);
  assert.match(boundary,/이메일 문자열 일치만으로 자동 통합하지 않음|이메일.*자동.*병합/);
  assert.match(boundary,/서버가 EKODI ID의 실제 membership/);
});


test('Mall own verified account prevents a second Shell identity badge in shopping nav', async () => {
  const source = await read('shell/unified-user-auth.js');
  const css = await read('sites/ekodi-mall/assets/home-refresh.css');
  const browserHeader = await read('mall-shared-header.js');
  assert.match(browserHeader, /data-mall-account/);
  assert.match(source, /if\(header\.querySelector\('\[data-mall-account\]'\)\)/);
  assert.match(source, /header\.querySelector\('\[data-ekodi-unified-auth\]'\)\?\.remove\(\)/);
  assert.match(css, /\.mall-header \.mall-primary-nav \[data-ekodi-unified-auth\]\{display:none!important\}/);

  let removed = 0;
  let appended = 0;
  let duplicate = { remove() { removed++; duplicate = null; } };
  const header = {
    closest() { return null; },
    querySelector(selector) {
      if (selector === '[data-mall-account]') return { verifiedSiteAccountUI:true };
      if (selector === '[data-ekodi-unified-auth]') return duplicate;
      if (selector === 'nav') return { append() { appended++; } };
      return null;
    }
  };
  const listeners = new Map();
  const context = {
    window: {
      EKODIUserUIHeader: { getState() { return { enabled:true }; } },
      addEventListener(name, callback) { listeners.set(name, callback); }
    },
    document: {
      readyState: 'loading',
      querySelectorAll(selector) {
        return selector.includes('header[data-ekodi-user-header-root]') ? [header] : [];
      },
      addEventListener() {},
      getElementById() { return null; },
      createElement() { throw new Error('Mall must not create a redundant Shell account'); }
    },
    getComputedStyle() { return { display:'block', visibility:'visible' }; },
    requestAnimationFrame(callback) { callback(); }
  };
  new Script(source).runInNewContext(context);
  assert.ok(listeners.has('ekodi:auth-state'), 'Shell must observe auth events');
  listeners.get('ekodi:auth-state')();
  assert.equal(removed, 1, 'a previously injected Shell badge is removed');
  assert.equal(appended, 0, 'no new Shell badge is added to the shopping categories');
  listeners.get('focus')();
  assert.equal(removed, 1, 'later focus must not regenerate the duplicate');
  assert.equal(appended, 0);
  assert.equal(header.querySelector('[data-mall-account]').verifiedSiteAccountUI, true);
});
