import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleInsuranceNetwork, networkReady } from '../sites/ekodi-insurance/api/network.js';

class D1Statement {
  constructor(stmt,args=[]){this.stmt=stmt;this.args=args}
  bind(...args){return new D1Statement(this.stmt,args)}
  async all(){return{results:this.stmt.all(...this.args)}}
  async first(){return this.stmt.get(...this.args)||null}
  async run(){return this.stmt.run(...this.args)}
}
class D1 {
  constructor(db){this.db=db}
  prepare(sql){return new D1Statement(this.db.prepare(sql))}
}
function req(path,method='GET',body){return new Request(`https://insurance.test${path}`,{method,headers:{'content-type':'application/json','x-ekodi-insurance-internal-token':'test-token','x-ekodi-actor':'admin@test'},body:body?JSON.stringify(body):undefined})}
function migrate(db){for(const name of ['0001_consultation_queue.sql','0002_revoke_minimization.sql','0003_partner_catalog_outcomes.sql','0004_advisor_profile.sql','0005_insurance_practice_affiliations.sql'])db.exec(fs.readFileSync(new URL(`../sites/ekodi-insurance/api/migrations/${name}`,import.meta.url),'utf8'))}

test('8G insurance network keeps comparison behind partner and compliance gates',async()=>{
  const db=new DatabaseSync(':memory:');migrate(db);const env={DB:new D1(db),INSURANCE_INTERNAL_TOKEN:'test-token',INSURANCE_COMPARISON_PUBLIC_ENABLED:'false'};
  assert.equal(await networkReady(env),true);
  let result=await handleInsuranceNetwork(req('/api/internal/network/partners/par_alpha','PUT',{name:'Alpha GA',partnerType:'ga',status:'approved',agreementStatus:'review',feedMode:'manual'}),env);
  assert.equal(result.status,200);
  result=await handleInsuranceNetwork(req('/api/internal/network/catalog/off_alpha','PUT',{partnerId:'par_alpha',itemName:'보장자료 A',insurerName:'Alpha',category:'health',status:'approved',comparisonApproved:true}),env);
  assert.equal(result.status,409);
  result=await handleInsuranceNetwork(req('/api/internal/network/partners/par_alpha','PUT',{name:'Alpha GA',partnerType:'ga',status:'approved',agreementStatus:'signed',feedMode:'api'}),env);
  assert.equal(result.status,200);
  result=await handleInsuranceNetwork(req('/api/internal/network/catalog/off_alpha','PUT',{partnerId:'par_alpha',itemName:'보장자료 A',insurerName:'Alpha',category:'health',status:'approved',comparisonApproved:true}),env);
  assert.equal(result.status,200);
  result=await handleInsuranceNetwork(new Request('https://insurance.test/api/network/catalog'),env);
  assert.equal(result.body.enabled,false);assert.equal(result.body.items.length,0);
  env.INSURANCE_COMPARISON_PUBLIC_ENABLED='true';
  result=await handleInsuranceNetwork(new Request('https://insurance.test/api/network/catalog'),env);
  assert.equal(result.body.enabled,true);assert.equal(result.body.items.length,1);assert.equal(result.body.mode,'reference-only');
});

test('8G outcome ledger records non-PII funnel state only for approved partners',async()=>{
  const db=new DatabaseSync(':memory:');migrate(db);const env={DB:new D1(db),INSURANCE_INTERNAL_TOKEN:'test-token'};
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO consultation_requests(id,contact_name,contact_ciphertext,contact_hint,preferred_time,ai_summary,transcript_shared,status,access_token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('con_case','고객','cipher','***-***-0000','','일반 보험관리 상담',0,'new','hash',now,now);
  let result=await handleInsuranceNetwork(req('/api/internal/network/outcomes/con_case','PUT',{partnerId:'par_missing',stage:'assigned'}),env);
  assert.equal(result.status,409);
  result=await handleInsuranceNetwork(req('/api/internal/network/partners/par_beta','PUT',{name:'Beta GA',partnerType:'ga',status:'approved',agreementStatus:'signed',feedMode:'api'}),env);
  assert.equal(result.status,200);
  result=await handleInsuranceNetwork(req('/api/internal/network/outcomes/con_case','PUT',{partnerId:'par_beta',stage:'completed',outcomeCode:'connected',externalCaseRef:'case-1',revenueKrw:10000,note:'synthetic'}),env);
  assert.equal(result.status,200);
  result=await handleInsuranceNetwork(req('/api/internal/network/funnel'),env);
  const completed=(result.body.outcomes||[]).find(x=>x.stage==='completed');
  assert.equal(Number(completed?.n||0),1);
  assert.equal(Number(completed?.revenue||0),10000);
  assert.equal(JSON.stringify(result.body).includes('***-***-0000'),false);
  assert.equal(JSON.stringify(result.body).includes('cipher'),false);
});
