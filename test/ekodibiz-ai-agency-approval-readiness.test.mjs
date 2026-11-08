import test from 'node:test';
import assert from 'node:assert/strict';
import {agencyApi,agencyStore} from '../ekodibiz-ai-agency.js';

class MemoryStorage {
  constructor(){this.values=new Map();}
  async get(key){return structuredClone(this.values.get(key));}
  async put(key,value){this.values.set(key,structuredClone(value));}
  async list({prefix}){return new Map([...this.values].filter(([key])=>key.startsWith(prefix)));}
}
const adminKey='test-agency-readiness-admin-key-long-enough';
function environment(){
  const storage=new MemoryStorage();
  return {
    AGENCY_ADMIN_KEY:adminKey,
    REVENUE_STORE:{idFromName:name=>name,get:()=>({
      fetch:(url,init)=>agencyStore(new Request(url,init),storage)
    })}
  };
}
async function api(env,path,body={},admin=false){
  const url=new URL('https://ekodi.kr/ekodibiz/api/agency'+path);
  const res=await agencyApi(new Request(url,{method:'POST',headers:{
    'content-type':'application/json',...(admin?{'x-ekodibiz-agency-admin':adminKey}:{})
  },body:JSON.stringify(body)}),url,env);
  return {status:res.status,body:await res.json()};
}
const application={type:'individual',provider:'Example AI',service:'Business account',
  customer:'Synthetic Example',email:'synthetic@example.test',organization:'',
  months:4,terms:true,consent:true};
async function acceptedContract(env,supplierAmount){
  const a=await api(env,'/apply',application);
  assert.equal(a.status,201);
  const r={id:a.body.id,receiptToken:a.body.receiptToken};
  const q=await api(env,'/admin/quote',{id:r.id,feeAmount:10000,supplierAmount},true);
  assert.equal(q.status,200);
  assert.equal((await api(env,'/accept',{...r,accepted:true})).status,200);
  return r;
}
function liveConfig(env){
  Object.assign(env,{
    PAYMENTS_ENABLED:'true',AGENCY_PG_SCOPE_VERIFIED:'true',
    AGENCY_SUPPLIER_COLLECTION_VERIFIED:'true',AGENCY_LIVE_ENABLED:'true',
    TOSS_CLIENT_KEY:'live_gck_synthetic_only',TOSS_SECRET_KEY:'live_gsk_synthetic_only'
  });
}
function refsAndArchive(env){
  Object.assign(env,{
    AGENCY_LEGAL_APPROVAL_REF:'LEGAL-APPROVAL-2026',
    AGENCY_PG_APPROVAL_REF:'PG-APPROVAL-2026',
    AGENCY_SUPPLIER_APPROVAL_REF:'PROVIDER-APPROVAL-2026',
    AGENCY_ARCHIVE_VERIFIED:'true',
    AGENCY_SETTLEMENT_ACTIVE_VERIFIED:'true'
  });
}

test('readiness API is company-admin-only and returns booleans, never secrets or approval IDs',async()=>{
  const env=environment();
  liveConfig(env);
  const denied=await api(env,'/admin/readiness');
  assert.equal(denied.status,403);
  const own=await api(env,'/admin/readiness',{},true);
  assert.equal(own.status,200);
  assert.equal(own.body.readiness.mode,'live');
  assert.equal(own.body.readiness.serviceFeeLiveReady,false);
  assert.equal(own.body.readiness.legalApprovalReferenceRecorded,false);
  assert.equal(own.body.readiness.pgApprovalReferenceRecorded,false);
  const serialized=JSON.stringify(own.body);
  for(const privateData of [env.AGENCY_ADMIN_KEY,env.TOSS_CLIENT_KEY,env.TOSS_SECRET_KEY,'LEGAL-APPROVAL-2026']){
    assert.ok(!serialized.includes(privateData));
  }
});
test('claimed approvals and enabled switches do not release live checkout without recorded refs, archive and settlement',async()=>{
  const env=environment();
  liveConfig(env);
  const receipt=await acceptedContract(env,0);
  let result=await api(env,'/checkout',receipt);
  assert.equal(result.status,503);
  let healthUrl=new URL('https://ekodi.kr/ekodibiz/api/agency/health');
  let response=await agencyApi(new Request(healthUrl),healthUrl,env);
  assert.equal((await response.json()).realPaymentsEnabled,false);
  refsAndArchive(env);
  result=await api(env,'/checkout',receipt);
  assert.equal(result.status,200);
  assert.equal(result.body.mode,'live');
  assert.equal(result.body.amount,10000);
  assert.equal(result.body.secretKey,undefined);
  response=await agencyApi(new Request(healthUrl),healthUrl,env);
  assert.equal((await response.json()).realPaymentsEnabled,true);
});
test('positive supplier collection also requires provider allowlisting, not just a generic approved switch',async()=>{
  const env=environment();
  liveConfig(env);refsAndArchive(env);
  const receipt=await acceptedContract(env,5000);
  assert.equal((await api(env,'/checkout',receipt)).status,503);
  env.AGENCY_APPROVED_SUPPLIER_NAMES='not valid JSON';
  assert.equal((await api(env,'/checkout',receipt)).status,503);
  env.AGENCY_APPROVED_SUPPLIER_NAMES='["Other Provider"]';
  assert.equal((await api(env,'/checkout',receipt)).status,503);
  env.AGENCY_APPROVED_SUPPLIER_NAMES='["Example AI"]';
  const approved=await api(env,'/checkout',receipt);
  assert.equal(approved.status,200);
  assert.equal(approved.body.amount,15000);
  // Payment checkout only returns a payment request: no charge, capture, settlement, or provider action.
});
test('staging test-key checkout remains available under existing dedicated scope gate without live evidence',async()=>{
  const env=environment();
  Object.assign(env,{PAYMENTS_ENABLED:'true',AGENCY_PG_SCOPE_VERIFIED:'true',
    TOSS_CLIENT_KEY:'test_gck_synthetic_only',TOSS_SECRET_KEY:'test_gsk_synthetic_only'});
  const receipt=await acceptedContract(env,0);
  const r=await api(env,'/checkout',receipt);
  assert.equal(r.status,200);
  assert.equal(r.body.mode,'test');
  const h=new URL('https://ekodi.kr/ekodibiz/api/agency/health');
  const health=await agencyApi(new Request(h),h,env);
  assert.equal((await health.json()).realPaymentsEnabled,false);
});
