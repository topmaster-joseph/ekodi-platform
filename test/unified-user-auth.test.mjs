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
  const sharedCss=await read('shell/user-ui-shell.css');
  new Script(source,{filename:'shell/unified-user-auth.js'});
  assert.match(worker,/unifiedAuthUrl\.pathname='\/unified-user-auth\.js'/);
  assert.match(worker,/\$\{linkCompat\}\\n\$\{unifiedAuth\}\\n/);
  assert.match(worker,/x-ekodi-unified-user-auth/);
  assert.match(source,/EKODIUserUIHeader\?\.getState\?\.\(\)\.enabled!==true/);
  assert.match(source,/login\.origin|location\.origin\+location\.pathname\+location\.search/);
  assert.match(source,/shortName\(display\)/);
  assert.match(source,/chars\.length>12/);
  assert.match(source,/profile-api\/me/);
  // Public login remains visible without injecting blocked inline style.
  assert.match(source,/link\.rel='stylesheet'/);
  assert.match(source,/link\.href='\/shell\/user-ui-shell\.css'/);
  assert.match(source,/data-ekodi-user-ui-style/);
  assert.doesNotMatch(source,/document\.createElement\(['"]style['"]\)/);
  assert.doesNotMatch(source,/style\.textContent\s*=/);
  assert.match(sharedCss,/EKODI-UNIFIED-AUTH-CSP-001/);
  assert.match(sharedCss,/\.ekodi-unified-auth\{/);
  assert.match(sharedCss,/\.ekodi-unified-auth__link:focus-visible/);
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


test('strict CSP Shell modules keep all media, messages, illustration and design styles in first-party CSS',async()=>{
  const modules=[
    'shell/media-meeting-adapter.js',
    'ekodi-message-ui.js',
    'shell/illustration-system.js',
    'shell/service-design-inheritance.js'
  ];
  const [sharedCss,...sources]=await Promise.all([
    read('shell/user-ui-shell.css'),
    ...modules.map(read)
  ]);
  assert.match(sharedCss,/EKODI-STRICT-CSP-SERVICES-002/);
  for(let i=0;i<modules.length;i++){
    const code=sources[i];
    assert.match(code,/link\.rel='stylesheet'/,modules[i]);
    assert.match(code,/link\.href='\/shell\/user-ui-shell\.css'/,modules[i]);
    assert.match(code,/data-ekodi-user-ui-style/,modules[i]);
    assert.doesNotMatch(code,/document\.createElement\(['"]style['"]\)/,modules[i]);
    assert.doesNotMatch(code,/\.textContent\s*=\s*css\s*;/,modules[i]);
    new Script(code,{filename:modules[i]});
  }
  assert.match(sharedCss,/\[data-ekodi-media-provider="youtube"\] \.ekodi-media-state/);
  assert.match(sharedCss,/\.ekodi-message-ui__title/);
  assert.match(sharedCss,/@media\(prefers-reduced-motion:reduce\)\{\.ekodi-illustration__float/);
  assert.match(sharedCss,/:root\[data-ekodi-design-inheritance\]/);
});
