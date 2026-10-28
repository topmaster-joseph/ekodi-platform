import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalMinistryTenant,selectMinistryFinanceDisclosure} from '../ministry-finance-disclosure-policy.js';

const user={id:'auth-user-a'};
const churchMember={tenantId:'ekodi-church',userId:user.id,status:'active',verified:true};
const approved={
  tenantId:'ekodi-church',status:'approved',audience:'members',approvedBy:'finance-admin',
  approvedAt:'2026-10-28T02:00:00Z',periodStart:'2026-01-01',periodEnd:'2026-12-31',
  allowedSections:['income','expense','balance'],blocks:[
    {section:'income',category:'offerings',amount:300000,sourceCount:4,distinctContributors:3,approved:true,
     donorName:'NEVER EXPOSE',bankAccount:'NEVER EXPOSE',evidenceRef:'private-ref'},
    {section:'expense',category:'missions',amount:200000,sourceCount:5,approved:true},
    {section:'balance',category:'closing',amount:100000,sourceCount:10,approved:true},
    {section:'income',category:'donations',amount:80000,sourceCount:1,distinctContributors:1,approved:true},
    {section:'expense',category:'welfare',amount:50000,sourceCount:4,approved:false}
  ]
};
function view(overrides={}){return selectMinistryFinanceDisclosure({site:'ekodichurch',verifiedUser:user,membership:churchMember,publication:approved,...overrides});}
test('canonical tenant aliases never broaden the trust boundary',()=>{
  assert.equal(canonicalMinistryTenant('ekodichurch'),'ekodi-church');
  assert.equal(canonicalMinistryTenant('ekodimission'),'ekodimission');
  assert.equal(canonicalMinistryTenant('church'),null);
  assert.equal(canonicalMinistryTenant('__proto__'),null);
});
test('approved member reads only whitelisted aggregate fields',()=>{
  const result=view();
  assert.equal(result.ok,true);
  assert.equal(result.blocks.length,3);
  assert.deepEqual(result.blocks.map(b=>b.label),['헌금','선교','기말잔액']);
  const output=JSON.stringify(result);
  for(const forbidden of ['donorName','bankAccount','evidenceRef','private-ref','NEVER EXPOSE','distinctContributors'])
    assert.equal(output.includes(forbidden),false,forbidden);
});
test('unlinked or email-only users are denied, even when Google authenticated',()=>{
  assert.equal(view({membership:null}).ok,false);
  assert.equal(view({membership:{...churchMember,verified:false}}).ok,false);
  assert.equal(view({membership:{...churchMember,userId:'another-person'}}).ok,false);
  assert.equal(view({verifiedUser:null}).ok,false);
});
test('site boundary rejects church data for mission member',()=>{
  const missionMember={tenantId:'ekodimission',userId:user.id,status:'active',verified:true};
  assert.equal(view({site:'ekodimission',membership:missionMember}).reason,'not_published');
  assert.equal(view({membership:missionMember}).reason,'membership_required');
});
test('draft, revoked and nonmember publication are not visible',()=>{
  for(const status of ['draft','revoked','pending']){
    assert.equal(view({publication:{...approved,status}}).ok,false);
  }
  assert.equal(view({publication:{...approved,audience:'public'}}).ok,false);
  assert.equal(view({publication:{...approved,approvedBy:null}}).ok,false);
});
test('members choose sections but never add administrator-only sections',()=>{
  const result=view({requestedSections:['expense','expense']});
  assert.deepEqual(result.sections,['expense']);
  assert.deepEqual(result.blocks.map(b=>b.label),['선교']);
  assert.equal(view({requestedSections:['raw_transactions']}).ok,false);
  assert.deepEqual(view({requestedSections:[]}).blocks,[]);
});
test('small group disclosures, unapproved rows and unknown labels are suppressed',()=>{
  const result=view({publication:{...approved,blocks:[...approved.blocks,
    {section:'expense',category:'recipientName:홍길동',amount:5,sourceCount:9,approved:true},
    {section:'income',category:'other',amount:5,sourceCount:4,distinctContributors:2,approved:true}
  ]}});
  assert.equal(result.blocks.length,3);
});
test('amount and period validation is fail-closed',()=>{
  assert.equal(view({publication:{...approved,periodStart:'2026-12-31',periodEnd:'2026-01-01'}}).ok,false);
  assert.equal(view({publication:{...approved,allowedSections:null}}).ok,false);
  const result=view({publication:{...approved,blocks:[{section:'income',category:'offerings',amount:NaN,sourceCount:4,distinctContributors:4,approved:true}]}});
  assert.deepEqual(result.blocks,[]);
});
