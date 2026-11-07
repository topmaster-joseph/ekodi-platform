import test from 'node:test';
import assert from 'node:assert/strict';
import { agencyApi, agencyStore } from '../ekodibiz-ai-agency.js';

class MemoryStorage {
  constructor(){this.items=new Map();}
  async get(k){return structuredClone(this.items.get(k));}
  async put(k,v){this.items.set(k,structuredClone(v));}
  async list({prefix}){return new Map([...this.items.entries()].filter(([k])=>k.startsWith(prefix)));}
}
const adminKey='dev-only-internal-test-key-minimum-32-chars';
function env(){
  const memory=new MemoryStorage();
  return {memory,AGENCY_ADMIN_KEY:adminKey,AGENCY_SUPPLIER_COLLECTION_VERIFIED:'true',
    REVENUE_STORE:{idFromName:name=>name,get:()=>({
      fetch:(url,init)=>agencyStore(new Request(url,init),memory)
    })}};
}
async function api(e,path,body={},key=''){
  const url=new URL('https://ekodi.kr/ekodibiz/api/agency'+path);
  const response=await agencyApi(new Request(url,{method:'POST',headers:{
    'content-type':'application/json',...(key?{'x-ekodibiz-agency-admin':key}:{})
  },body:JSON.stringify(body)}),url,e);
  return {status:response.status,body:await response.json()};
}
const form={type:'institution',months:3,provider:'Synthetic Example AI',service:'User-owned account',
  customer:'Contract Manager',email:'pilot-university@example.test',
  organization:'Synthetic Test University',description:'three month invoice-only synthetic test',terms:true,consent:true};
async function setup(e,supplierAmount=90000,months=form.months){
  const apply=await api(e,'/apply',{...form,months});assert.equal(apply.status,201);
  const id=apply.body.id;const quote=await api(e,'/admin/quote',
    {id,feeAmount:20000,supplierAmount},adminKey);assert.equal(quote.status,200);
  const accept=await api(e,'/accept',{id,receiptToken:apply.body.receiptToken,accepted:true});
  assert.equal(accept.status,200);
  // Mock the existing, separately secured PG confirmation in the Durable Object.
  // This fixture performs no payment and must never be exposed as an API shortcut.
  const settle=await agencyStore(new Request('https://revenue-store.internal/agency/settle',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({id,paymentKey:'synthetic-nonpayment-reference',totalAmount:20000+supplierAmount})
  }),e.memory);
  assert.equal(settle.status,200);
  const activate=await api(e,'/admin/activate',{id,confirmed:true},adminKey);
  assert.equal(activate.status,200);
  return {id,receiptToken:apply.body.receiptToken};
}
const cycle=(id,n,amount=30000,receiptRef='INV-SYNTHETIC-001')=>({id,cycle:n,amount,
  receiptRef,paidOn:'2026-11-05',confirmed:true});

test('operator-only settlement starts at 3 months with no evidence or personal credentials',async()=>{
  const e=env(),{id}=await setup(e);
  const denied=await api(e,'/admin/settlement',{id});
  assert.equal(denied.status,403);
  const result=await api(e,'/admin/settlement',{id},adminKey);
  assert.equal(result.status,200);
  assert.equal(result.body.settlement.months,3);
  assert.equal(result.body.settlement.providerBudget,90000);
  assert.equal(result.body.settlement.unallocatedProviderBudget,90000);
  assert.equal(result.body.settlement.cycles.length,0);
  assert.equal(result.body.settlement.renewalStopRecorded,false);
});
test('up to three manual receipts are recorded without making a provider charge',async()=>{
  const e=env(),{id}=await setup(e);
  for(let n=1;n<=3;n++){
    const result=await api(e,'/admin/record-cycle',cycle(id,n,30000,'INV-SYNTHETIC-00'+n),adminKey);
    assert.equal(result.status,200,result.body.error);
  }
  const statement=(await api(e,'/admin/settlement',{id},adminKey)).body.settlement;
  assert.equal(statement.recordedSupplierSpending,90000);
  assert.equal(statement.unallocatedProviderBudget,0);
  assert.deepEqual(statement.cycles.map(c=>c.cycle),[1,2,3]);
  assert.equal(statement.cycles[0].receiptRef,'INV-SYNTHETIC-001');
  assert.equal(statement.renewalStopRecorded,false);
  assert.equal(e.PAYMENTS_ENABLED,undefined);
});
test('duplicate cycle, reused receipt, over-contract cycles and supplier budget overrun are denied',async()=>{
  const e=env(),{id}=await setup(e);
  assert.equal((await api(e,'/admin/record-cycle',cycle(id,1),adminKey)).status,200);
  assert.equal((await api(e,'/admin/record-cycle',cycle(id,1),adminKey)).status,409);
  assert.equal((await api(e,'/admin/record-cycle',cycle(id,2,30000,'INV-SYNTHETIC-001'),adminKey)).status,409);
  assert.equal((await api(e,'/admin/record-cycle',cycle(id,4),adminKey)).status,422);
  assert.equal((await api(e,'/admin/record-cycle',cycle(id,2,70000,'INV-SYNTHETIC-002'),adminKey)).status,409);
  const statement=(await api(e,'/admin/settlement',{id},adminKey)).body.settlement;
  assert.equal(statement.cycles.length,1);
});
test('stolen credential field or invalid date and false evidence confirmation are blocked',async()=>{
  const e=env(),{id}=await setup(e);
  assert.equal((await api(e,'/admin/record-cycle',{...cycle(id,1),password:'forbidden'},adminKey)).status,422);
  assert.equal((await api(e,'/admin/record-cycle',{...cycle(id,1),paidOn:'2026-02-30'},adminKey)).status,422);
  assert.equal((await api(e,'/admin/record-cycle',{...cycle(id,1),confirmed:false},adminKey)).status,422);
  assert.equal((await api(e,'/admin/record-cycle',{...cycle(id,1),receiptRef:'someone@example.test'},adminKey)).status,422);
});
test('supplier renewal stop is manual evidence, keeps personal account, and cannot be repeated',async()=>{
  const e=env(),{id}=await setup(e);
  const payload={id,cancellationRef:'CANCEL-2027-0001',personalAccountKept:true,confirmed:true};
  assert.equal((await api(e,'/admin/stop-renewal',{...payload,personalAccountKept:false},adminKey)).status,422);
  const done=await api(e,'/admin/stop-renewal',payload,adminKey);
  assert.equal(done.status,200);
  assert.equal((await api(e,'/admin/stop-renewal',payload,adminKey)).status,409);
  const statement=(await api(e,'/admin/settlement',{id},adminKey)).body.settlement;
  assert.equal(statement.renewalStopRecorded,true);
  assert.equal(statement.accountKeptAttested,true);
  assert.equal(statement.renewalStopReceipt.receiptRef,'CANCEL-2027-0001');
  assert.equal(statement.contractStatus,'active');
});
test('no supplier subscription budget means no supplier payment receipts',async()=>{
  const e=env(),{id}=await setup(e,0);
  const r=await api(e,'/admin/record-cycle',cycle(id,1),adminKey);
  assert.equal(r.status,409);
  assert.equal(r.body.error,'no_provider_budget');
});

test('university can see only own three-cycle statement through existing receipt code',async()=>{
  const e=env(),{id,receiptToken}=await setup(e);
  const status=await api(e,'/status',{id,receiptToken});
  assert.equal(status.status,200);
  const x=status.body.campus;
  assert.equal(x.agreementId,id);
  assert.equal(x.organization,'Synthetic Test University');
  assert.equal(x.months,3);
  assert.equal(x.periods.length,3);
  assert.equal(x.feeAmount,20000);
  assert.equal(x.supplierBudget,90000);
  assert.equal(x.recordedSupplierSpending,0);
  assert.equal(x.unallocatedSupplierBudget,90000);
  assert.equal(x.renewalStopEvidenceRecorded,false);
  for(const confidential of ['tokenHash','receiptToken','email','paymentKey','password','otp','chatContent','audit'])
    assert.equal(JSON.stringify(x).includes('"'+confidential+'"'),false,confidential);
});
test('university lookup does not disclose a different contract or accept a wrong token',async()=>{
  const e=env(),a=await setup(e);
  const b=await api(e,'/apply',{...form,email:'another-manager@example.test',organization:'Other Campus'});
  assert.equal(b.status,201);
  const wrong=await api(e,'/status',{id:a.id,receiptToken:b.body.receiptToken});
  assert.equal(wrong.status,404);
  const wrong2=await api(e,'/status',{id:b.body.id,receiptToken:a.receiptToken});
  assert.equal(wrong2.status,404);
  const own=await api(e,'/status',{id:b.body.id,receiptToken:b.body.receiptToken});
  assert.equal(own.status,200);
  assert.equal(own.body.campus.organization,'Other Campus');
  assert.equal(own.body.campus.supplierBudget,null);
  assert.equal(own.body.campus.unallocatedSupplierBudget,null);
});
test('university summary reflects manual records and cancellation but cannot modify them',async()=>{
  const e=env(),a=await setup(e);
  await api(e,'/admin/record-cycle',cycle(a.id,1,25000,'INV-CAMPUS-001'),adminKey);
  await api(e,'/admin/stop-renewal',{id:a.id,cancellationRef:'CANCEL-CAMPUS-001',
    personalAccountKept:true,confirmed:true},adminKey);
  const status=await api(e,'/status',{id:a.id,receiptToken:a.receiptToken});
  assert.equal(status.body.campus.recordedSupplierSpending,25000);
  assert.equal(status.body.campus.unallocatedSupplierBudget,65000);
  assert.equal(status.body.campus.periods[0].status,'operator_recorded');
  assert.equal(status.body.campus.periods[0].receiptRef,'INV-CAMPUS-001');
  assert.equal(status.body.campus.periods[1].status,'not_recorded');
  assert.equal(status.body.campus.renewalStopEvidenceRecorded,true);
  assert.equal(status.body.campus.accountPreservationAttested,true);
  const denied=await api(e,'/admin/record-cycle',cycle(a.id,2,25000,'INV-CAMPUS-002'));
  assert.equal(denied.status,403);
});
test('individual receipt lookup discloses only that contract summary, no private credentials',async()=>{
  const e=env();
  const a=await api(e,'/apply',{...form,type:'individual',organization:''});
  assert.equal(a.status,201);
  const status=await api(e,'/status',{id:a.body.id,receiptToken:a.body.receiptToken});
  assert.equal(status.status,200);
  assert.equal(status.body.campus.months,form.months);
  assert.equal(status.body.campus.organization,null);
  assert.equal(status.body.campus.periods.length,form.months);
  assert.equal(status.body.campus.supplierBudget,null);
  for(const confidential of ['tokenHash','receiptToken','email','paymentKey','audit'])
    assert.equal(JSON.stringify(status.body.campus).includes('"'+confidential+'"'),false);
});


test('custom 5-month contract accepts month four and five, rejects sixth and duplicate references',async()=>{
  const e=env(),{id,receiptToken}=await setup(e,150000,5);
  const before=await api(e,'/status',{id,receiptToken});
  assert.equal(before.body.campus.months,5);
  assert.equal(before.body.campus.periods.length,5);
  assert.equal((await api(e,'/admin/record-cycle',cycle(id,4,30000,'INV-FLEX-004'),adminKey)).status,200);
  assert.equal((await api(e,'/admin/record-cycle',cycle(id,5,30000,'INV-FLEX-005'),adminKey)).status,200);
  assert.equal((await api(e,'/admin/record-cycle',cycle(id,6,30000,'INV-FLEX-006'),adminKey)).status,422);
  assert.equal((await api(e,'/admin/record-cycle',cycle(id,3,30000,'INV-FLEX-004'),adminKey)).status,409);
  const statement=(await api(e,'/admin/settlement',{id},adminKey)).body.settlement;
  assert.equal(statement.months,5);
  assert.deepEqual(statement.cycles.map(item=>item.cycle),[4,5]);
  assert.equal(statement.recordedSupplierSpending,60000);
  const own=await api(e,'/status',{id,receiptToken});
  assert.equal(own.body.campus.periods[3].status,'operator_recorded');
  assert.equal(own.body.campus.periods[4].status,'operator_recorded');
});

test('individual custom month contract can use manual provider evidence without live payment',async()=>{
  const e=env();
  const individual=await api(e,'/apply',{...form,type:'individual',months:8,organization:'',email:'personal-eight@example.test'});
  assert.equal(individual.status,201);
  const id=individual.body.id,receiptToken=individual.body.receiptToken;
  const result=await api(e,'/admin/settlement',{id},adminKey);
  assert.equal(result.status,200);
  assert.equal(result.body.settlement.months,8);
  const status=await api(e,'/status',{id,receiptToken});
  assert.equal(status.body.campus.periods.length,8);
  assert.equal(e.PAYMENTS_ENABLED,undefined);
});
