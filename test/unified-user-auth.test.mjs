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
  assert.match(worker,/\$\{userHeader\}\\n\$\{unifiedAuth\}\\n\$\{userFooter\}/);
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
  assert.match(manifest,/identityProvider:'ekodi-person'/);
  assert.match(manifest,/authHub:'https:\/\/ekodi\.kr\/auth\/'/);
  assert.match(boundary,/이메일 문자열 일치만으로 자동 통합하지 않음|이메일.*자동.*병합/);
  assert.match(boundary,/서버가 EKODI ID의 실제 membership/);
});
