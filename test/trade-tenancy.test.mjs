import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounterparty, normalizeTradeTenant, assertSameTenant, scopeTradeCases, canManageTrade, canSeeFinancials, TRADE_TENANCY_CONTRACT } from '../trade/tenant-model.js';

test('trade is a shared tenant platform on canonical host',()=>{
  assert.equal(TRADE_TENANCY_CONTRACT.canonicalHost,'trade.ekodi.kr');
  assert.equal(TRADE_TENANCY_CONTRACT.counterpartyIsolation,true);
  assert.equal(TRADE_TENANCY_CONTRACT.crossTenantImplicitAccess,false);
});

test('EKODI Biz and another customer use identical tenant contract',()=>{
  const biz=normalizeTradeTenant({tenantId:'tenant-ekodibiz',name:'에코디비즈',role:'tenant_admin'});
  const other=normalizeTradeTenant({tenantId:'tenant-customer-b',name:'고객사 B',role:'trade_manager'});
  assert.equal(biz.role,'tenant_admin');
  assert.equal(other.role,'trade_manager');
  assert.throws(()=>assertSameTenant(biz,other),/cross_tenant_access_denied/);
});

test('counterparties remain scoped inside one customer company',()=>{
  const supplier=createCounterparty({id:'jixing',tenantId:'tenant-ekodibiz',name:'Jixing',type:'supplier',countryCode:'CN'});
  const buyer=createCounterparty({id:'buyer-a',tenantId:'tenant-ekodibiz',name:'Buyer A',type:'buyer',countryCode:'KR'});
  assertSameTenant(supplier,buyer);
  const cases=[
    {id:'1',tenantId:'tenant-ekodibiz',counterpartyId:'jixing'},
    {id:'2',tenantId:'tenant-ekodibiz',counterpartyId:'buyer-a'},
    {id:'3',tenantId:'tenant-customer-b',counterpartyId:'jixing'},
  ];
  assert.deepEqual(scopeTradeCases(cases,{tenantId:'tenant-ekodibiz',counterpartyId:'jixing'}).map(x=>x.id),['1']);
});

test('financial and management authority is narrower than ordinary access',()=>{
  assert.equal(canManageTrade('tenant_admin'),true);
  assert.equal(canManageTrade('viewer'),false);
  assert.equal(canSeeFinancials('accounting'),true);
  assert.equal(canSeeFinancials('trade_operator'),false);
});
