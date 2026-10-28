import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const worker=read('scripts/admin-authenticated-e2e-menu-worker.mjs');
const workflow=read('.github/workflows/verify-admin-authenticated-production-e2e.yml');
const probe=worker.split('async function verifySocialInventory(')[1]?.split("\ntry {\n  stage('browser');")[0]||'';

test('production social E2E tests real UI search, source and status event handlers, with a disposable DOM-only sentinel',()=>{
  assert.match(probe,/stage\('social-ui-filter-controls'\)/);
  for(const selector of ['data-social-search','data-social-result-count','data-social-account-search','data-social-account-source','data-social-account-filter','data-social-links'])
    assert.ok(probe.includes(selector),selector+' missing from E2E');
  assert.match(probe,/dispatchEvent\(new Event\(event,\{bubbles:true\}\)\)/);
  assert.match(probe,/fixture\.dataset\.socialRecord='identity'/);
  assert.match(probe,/fixture\.dataset\.status='pending_provider_verification'/);
  assert.match(probe,/matching=!fixture\.hidden/);
  assert.match(probe,/wrongSource=fixture\.hidden/);
  assert.match(probe,/wrongStatus=fixture\.hidden/);
  assert.match(probe,/wrongSearch=fixture\.hidden/);
  assert.match(probe,/fixture\.remove\(\)/);
  assert.match(probe,/finally\{/);
  assert.match(probe,/serviceZero=.*providerCount\.textContent/);
  assert.match(probe,/serviceRestored=cards\.every/);
});

test('five real responsive browser widths are asserted and artifacts exclude account record lists',()=>{
  assert.match(probe,/stage\('social-responsive-visual'\)/);
  for(const label of ['[320,1]','[390,1]','[768,2]','[1366,4]','[1440,4]'])
    assert.ok(probe.includes(label),label+' responsive proof missing');
  assert.match(probe,/page\.setViewportSize\(\{width,height:1100\}\)/);
  assert.match(probe,/panel\.scrollWidth<=panel\.clientWidth/);
  assert.match(probe,/directory\.scrollWidth<=directory\.clientWidth/);
  assert.match(probe,/proof\.columns===expectedColumns/);
  assert.match(probe,/social-accounts-directory-/);
  assert.match(probe,/\.ekodi-social-directory'\)\.screenshot/);
  assert.match(workflow,/if: always\(\) && inputs\.focus_menu == 'social-accounts'/);
  assert.match(workflow,/artifacts\/admin-authenticated-e2e\/social-accounts-directory-390\.png/);
  assert.match(workflow,/artifacts\/admin-authenticated-e2e\/social-accounts-directory-1440\.png/);
  assert.match(workflow,/retention-days: 7/);
});

test('focused acceptance remains strictly read-only and does not leak identifiers',()=>{
  assert.match(probe,/authenticatedStatus!==200/);
  assert.match(probe,/guestStatus!==401/);
  assert.match(probe,/noStoreCache!==true/);
  assert.match(probe,/registrationEnabled!==false/);
  assert.match(probe,/oauthLinkingEnabled!==false/);
  assert.match(probe,/socialLoginEnabled!==false/);
  assert.match(probe,/autoPublishingEnabled!==false/);
  assert.match(probe,/credentials:'omit'/);
  assert.match(probe,/method:'GET'/);
  assert.doesNotMatch(probe,/method:['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(probe,/data\.accounts|data\.existingServiceConnections/);
  assert.doesNotMatch(probe,/\.screenshot\(\{\s*path:.*(?:social-record|social-links)/);
  assert.match(worker,/adminEntryTransport\.status === 429/);
  assert.match(workflow,/E2E_MENU_FOCUS:.*inputs\.focus_menu/);
  assert.match(workflow,/Revoke short-lived E2E session/);
});
