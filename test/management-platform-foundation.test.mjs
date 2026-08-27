import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MANAGEMENT_ACCESS_POLICY,
  MANAGEMENT_MODULES,
  MANAGEMENT_WORKSPACE_KINDS,
  MANAGEMENT_WORKSPACE_TYPES,
  entitlementPreview,
  moduleCanMutateExternalState,
  workspaceContext
} from '../management-platform.js';

const policy=JSON.parse(readFileSync(new URL('../config/management-platform.json',import.meta.url),'utf8'));

test('management platform preserves EKODI guest and Google-free-entry policy',()=>{
  assert.equal(MANAGEMENT_ACCESS_POLICY.guestMode,'guide-only');
  assert.equal(MANAGEMENT_ACCESS_POLICY.identityProvider,'google');
  assert.equal(MANAGEMENT_ACCESS_POLICY.minimumTier,'free');
  assert.equal(policy.platform.authHub,'https://auth.ekodi.kr/');
  assert.equal(policy.platform.shellRequired,true);
});

test('customer types map onto the existing canonical EKODI workspace kinds',()=>{
  for(const kind of ['person','business','organization','community','project']) assert.ok(MANAGEMENT_WORKSPACE_KINDS.includes(kind));
  const franchiseType=MANAGEMENT_WORKSPACE_TYPES.find(item=>item.id==='franchise');
  const institutionType=MANAGEMENT_WORKSPACE_TYPES.find(item=>item.id==='institution');
  assert.equal(franchiseType?.canonicalKind,'organization');
  assert.equal(institutionType?.canonicalKind,'organization');
  const franchise=workspaceContext({id:'brand-a',type:'franchise',role:'owner',capabilities:['menu','sales','menu']});
  const store=workspaceContext({id:'store-1',type:'business',parentId:franchise.id,role:'manager'});
  assert.equal(franchise.type,'franchise');
  assert.equal(franchise.kind,'organization');
  assert.equal(store.kind,'business');
  assert.equal(store.parentId,'brand-a');
  assert.deepEqual(franchise.capabilities,['menu','sales']);
});

test('tier and module choice remain independent',()=>{
  const free=entitlementPreview({tier:'free',selectedModuleIds:['review','menu']});
  assert.equal(free.tier,'free');
  assert.deepEqual(free.selectedModules,['menu','review']);
  assert.equal(free.selectionBlockedByTier,false);
  assert.equal(free.principle,'base-tier + selected-modules + usage');
});

test('existing Marketing AI is reused and specialist catalog contains requested first wave',()=>{
  const marketing=MANAGEMENT_MODULES.find(module=>module.id==='marketing');
  assert.equal(marketing?.reuseExisting,true);
  assert.equal(marketing?.url,'https://marketing.ekodi.kr/');
  for(const id of ['chief','marketing','menu','order','review','customer','sales']) assert.ok(MANAGEMENT_MODULES.some(module=>module.id===id));
});

test('external channel mutations fail closed without approval and official adapters',()=>{
  assert.deepEqual(moduleCanMutateExternalState('order','external_order_mutation'),{allowed:false,reason:'human_approval_required'});
  assert.deepEqual(moduleCanMutateExternalState('order','external_order_mutation',{humanApproved:true}),{allowed:false,reason:'official_adapter_disabled'});
  assert.deepEqual(moduleCanMutateExternalState('order','external_order_mutation',{humanApproved:true,adapterEnabled:true}),{allowed:true,reason:'approved_adapter'});
});

test('canonical data contract includes menu/order/review shared identifiers',()=>{
  for(const entity of ['product','menu','channel-menu-mapping','order','review']) assert.ok(policy.canonicalData.entities.includes(entity));
  assert.match(policy.canonicalData.crossModuleRule,/no private cross-module database reads/i);
});
