import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommendDelivery, calculateSettlement, buildOperationsBrief, calculateSubsidy, capabilitiesForRole, buildWorkspaceModel } from '../delivery/core.js';

const migration=readFileSync(new URL('../supabase/migrations/202608300220_delivery_operations_v2.sql',import.meta.url),'utf8');

test('balanced mode recommends the best cost-time-reliability balance without dispatching',()=>{
  const result=recommendDelivery({order:{amount:32000,priority:'balanced'},providers:[
    {id:'a',name:'A',fee:3800,etaMinutes:28,reliability:.9},
    {id:'b',name:'B',fee:4200,etaMinutes:19,reliability:.92},
    {id:'c',name:'C',fee:3500,etaMinutes:34,reliability:.86},
  ]});
  assert.equal(result.ok,true);
  assert.equal(result.dispatchExecuted,false);
  assert.equal(result.humanConfirmationRequired,true);
  assert.ok(['a','b','c'].includes(result.recommendedProviderId));
  assert.equal(result.ranked.length,3);
});

test('speed priority selects the fastest provider for the reference case',()=>{
  const result=recommendDelivery({order:{amount:32000,priority:'speed'},providers:[
    {id:'a',fee:3800,etaMinutes:28,reliability:.9},
    {id:'b',fee:4200,etaMinutes:19,reliability:.92},
    {id:'c',fee:3500,etaMinutes:34,reliability:.86},
  ]});
  assert.equal(result.recommendedProviderId,'b');
});

test('cost priority selects the cheapest provider for the reference case',()=>{
  const result=recommendDelivery({order:{amount:32000,priority:'cost'},providers:[
    {id:'a',fee:3800,etaMinutes:28,reliability:.9},
    {id:'b',fee:4200,etaMinutes:19,reliability:.92},
    {id:'c',fee:3500,etaMinutes:34,reliability:.86},
  ]});
  assert.equal(result.recommendedProviderId,'c');
});

test('policy rejects over-limit providers and computes cooperative subsidy',()=>{
  const result=recommendDelivery({
    order:{amount:30000,priority:'balanced'},
    policy:{id:'association-default',maxDeliveryFee:4000,subsidyType:'fixed',subsidyValue:1000,customerMinShare:500},
    providers:[
      {id:'a',fee:3900,etaMinutes:26,reliability:.9},
      {id:'b',fee:4500,etaMinutes:18,reliability:.95},
    ],
  });
  assert.equal(result.ok,true);
  assert.equal(result.recommendedProviderId,'a');
  assert.equal(result.rejected[0].id,'b');
  assert.deepEqual(result.rejected[0].reasons,['fee_over_limit']);
  assert.equal(result.funding.subsidy,1000);
  assert.equal(result.dispatchExecuted,false);
});

test('subsidy policy respects customer minimum share and cap',()=>{
  assert.equal(calculateSubsidy(4000,{subsidyType:'percent',subsidyValue:80,subsidyCap:2500,customerMinShare:1000}),2500);
  assert.equal(calculateSubsidy(2000,{subsidyType:'fixed',subsidyValue:1800,customerMinShare:500}),1500);
});

test('settlement preview never executes settlement and keeps shares consistent',()=>{
  const result=calculateSettlement([{orderAmount:30000,deliveryFee:4000,subsidy:1000,customerShare:500}]);
  assert.equal(result.settlementExecuted,false);
  assert.equal(result.totals.deliveryFee,4000);
  assert.equal(result.totals.subsidy,1000);
  assert.equal(result.totals.customerShare,500);
  assert.equal(result.totals.merchantShare,2500);
  assert.equal(result.balanced,true);
  assert.equal(result.rows[0].deliveryFunding,4000);
});

test('settlement can derive subsidy from an organization policy',()=>{
  const result=calculateSettlement([{orderRef:'A-1',orderAmount:30000,deliveryFee:4000,customerShare:500}],{id:'joint',subsidyType:'fixed',subsidyValue:1000});
  assert.equal(result.rows[0].subsidy,1000);
  assert.equal(result.rows[0].merchantShare,2500);
  assert.equal(result.rows[0].policyId,'joint');
});

test('operations brief reports delay and subsidy totals from registered planning data',()=>{
  const brief=buildOperationsBrief([{status:'planned',deliveryFee:4100,subsidy:1000,etaMinutes:50,targetMinutes:45},{status:'done',deliveryFee:3900,subsidy:500,etaMinutes:20,targetMinutes:45}]);
  assert.equal(brief.count,2);
  assert.equal(brief.delayed,1);
  assert.equal(brief.averageDeliveryFee,4000);
  assert.equal(brief.subsidyTotal,1500);
  assert.equal(brief.generatedBy,'local-policy-engine');
});

test('existing EKODI roles map to delivery capabilities without a parallel role system',()=>{
  assert.ok(capabilitiesForRole('tenant_admin').includes('delivery:configure'));
  assert.ok(capabilitiesForRole('store_owner').includes('delivery:configure-store'));
  assert.equal(capabilitiesForRole('customer').length,0);
  const workspace=buildWorkspaceModel({role:'store_staff',tenant:{id:'t1'},stores:[{id:'s1'}]});
  assert.equal(workspace.version,2);
  assert.equal(workspace.executionEnabled,false);
  assert.ok(workspace.capabilities.includes('delivery:recommend'));
});

test('operations v2 schema is RLS protected and forbids execution state',()=>{
  for(const table of ['delivery_provider_connections','delivery_policies','delivery_decisions','delivery_settlement_drafts']){
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`revoke all on public\\.${table} from anon`));
  }
  assert.match(migration,/dispatch_executed boolean not null default false check \(dispatch_executed = false\)/);
  assert.match(migration,/settlement_executed boolean not null default false check \(settlement_executed = false\)/);
  assert.match(migration,/No credentials or provider secrets live in these tables/);
});
