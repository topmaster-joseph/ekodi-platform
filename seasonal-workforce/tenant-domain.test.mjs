import test from 'node:test';
import assert from 'node:assert/strict';
import {requireTenantAccess,buildDemandSubmission,authorizeDemandReview,tenantStatistics} from './tenant-domain.mjs';
const farm={userId:'farm-user',verifiedMemberships:[{tenantId:'muan',role:'farm_applicant',active:true}]};
const admin={userId:'county-user',verifiedMemberships:[{tenantId:'muan',role:'municipal_operator',active:true}]};
const input={crop:'onion',workers:4,start_month:'2026-11',duration_months:3,housing_status:'ready'};
test('anonymous is rejected',()=>assert.equal(requireTenantAccess(null,'muan',['farm_applicant']).status,401));
test('wrong tenant is rejected',()=>assert.equal(requireTenantAccess(farm,'other',['farm_applicant']).status,403));
test('inactive membership is rejected',()=>assert.equal(requireTenantAccess({userId:'x',verifiedMemberships:[{tenantId:'muan',role:'municipal_operator',active:false}]},'muan',['municipal_operator']).status,403));
test('farm can submit for its verified tenant',()=>assert.deepEqual(buildDemandSubmission(input,farm,'muan').record,{...input,tenant_id:'muan',created_by:'farm-user',status:'submitted'}));
test('farm cannot approve',()=>assert.equal(authorizeDemandReview(farm,'muan','approved').status,403));
test('operator can review only valid status',()=>{
 assert.equal(authorizeDemandReview(admin,'muan','approved').ok,true);
 assert.equal(authorizeDemandReview(admin,'muan','cancelled').status,400);
});
test('tenant statistics reject mixed records',()=>{
 assert.equal(tenantStatistics([{...input,status:'submitted',tenant_id:'other'}],admin,'muan').status,403);
 assert.equal(tenantStatistics([{...input,status:'submitted',tenant_id:'muan'}],admin,'muan').statistics.requested_workers,4);
});
