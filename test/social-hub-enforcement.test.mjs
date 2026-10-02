import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ADMIN_SERVICE_CATALOG, channelAdminServices, socialManagedServices, canonicalServiceSocialAdminPath } from '../admin-service-catalog.js';

const policy=JSON.parse(await readFile(new URL('../config/social-hub-enforcement.json',import.meta.url),'utf8'));

test('every current service inherits Social Hub governance',()=>{
  const managed=socialManagedServices();
  assert.equal(managed.length,ADMIN_SERVICE_CATALOG.length);
  assert.ok(managed.length>channelAdminServices().length);
  for(const service of managed){
    assert.equal(service.socialManaged,true,service.id);
    assert.ok(service.socialSubjectKey,service.id);
    assert.ok(canonicalServiceSocialAdminPath(service),service.id);
  }
});

test('local publishing sites keep local admin while other services fall back centrally',()=>{
  for(const service of socialManagedServices()){
    const path=canonicalServiceSocialAdminPath(service);
    if(service.channelAdminSection){
      assert.equal(service.socialAdminMode,'local-channel-center',service.id);
      assert.ok(path.includes('/admin'),service.id);
    }else{
      assert.equal(service.socialAdminMode,'central-social-hub',service.id);
      assert.match(path,/^\/admin\/content\/social\?social_scope=tenant&social_subject=/,service.id);
    }
  }
});

test('governance contract forbids opt out and raw password/token exposure',()=>{
  assert.equal(policy.status,'enforced');
  assert.equal(policy.scope.futureSitesAndServicesAutoInherit,true);
  assert.equal(policy.scope.perSiteOrServiceOptOutAllowed,false);
  assert.equal(policy.accountSecurity.passwordStorageForbidden,true);
  assert.equal(policy.accountSecurity.tokensNeverExposedToBrowserOrPublicApi,true);
  assert.equal(policy.publishing.idempotencyRequired,true);
});
