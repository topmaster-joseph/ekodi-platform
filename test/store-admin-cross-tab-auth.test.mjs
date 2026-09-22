import test from 'node:test';
import assert from 'node:assert/strict';
import { storeAdminPage, storeAdminScript } from '../store-admin-engine.js';

test('store admin shares authenticated session across tabs and hides logout while signed out',async()=>{
  const script=await storeAdminScript().text();
  assert.match(script,/localStorage\.getItem\(SESSION_KEY\)/);
  assert.match(script,/localStorage\.setItem\(SESSION_KEY/);
  assert.match(script,/window\.addEventListener\('storage'/);
  assert.match(script,/setAuthChrome\(false\)/);
  assert.match(script,/logout\.hidden=!signedIn/);
  assert.match(script,/role\.textContent='로그인 전'/);
  assert.match(script,/state\.role='';setAuthChrome\(false\);renderNav\(\);publishTenantContext\(''\)/);
});

test('store admin assets are cache-busted for delivery menu batch release',async()=>{
  const page=await storeAdminPage({slug:'jadam',name:'자담치킨 목포대점',id:'4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa',mark:'JD',brand:'JADAM CHICKEN'}).text();
  assert.match(page,/store-admin\.css\?v=20260922-delivery-menu-batch-v1/);
  assert.match(page,/store-admin\.js\?v=20260922-delivery-menu-batch-v1/);
});
