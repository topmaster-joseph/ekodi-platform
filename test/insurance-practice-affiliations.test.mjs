import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleInsuranceNetwork, networkReady } from '../sites/ekodi-insurance/api/network.js';
import { linkConsultationAffiliation, publicPracticeSnapshot } from '../sites/ekodi-insurance/api/practice.js';

class Statement { constructor(stmt,args=[]){this.stmt=stmt;this.args=args} bind(...args){return new Statement(this.stmt,args)} async all(){return{results:this.stmt.all(...this.args)}} async first(){return this.stmt.get(...this.args)||null} async run(){return this.stmt.run(...this.args)} }
class D1 { constructor(db){this.db=db} prepare(sql){return new Statement(this.db.prepare(sql))} }
const migrations=['0001_consultation_queue.sql','0002_revoke_minimization.sql','0003_partner_catalog_outcomes.sql','0004_advisor_profile.sql','0005_insurance_practice_affiliations.sql'];
function migrate(db){for(const name of migrations)db.exec(fs.readFileSync(new URL(`../sites/ekodi-insurance/api/migrations/${name}`,import.meta.url),'utf8'))}
function req(path,method='GET',body){return new Request(`https://insurance.test${path}`,{method,headers:{'content-type':'application/json','x-ekodi-insurance-internal-token':'test-token'},body:body?JSON.stringify(body):undefined})}

test('practice affiliation stays private until active identity is verified',async()=>{
  const db=new DatabaseSync(':memory:'); migrate(db); const env={DB:new D1(db),INSURANCE_INTERNAL_TOKEN:'test-token'};
  assert.equal(await networkReady(env),true);
  let result=await handleInsuranceNetwork(req('/api/internal/network/affiliations/aff_lotte-primary','PUT',{carrierKey:'lotte',carrierName:'Lotte',relationshipType:'planner',status:'active',registrationReference:'',verificationUrl:'https://example.com/verify',publicEnabled:true}),env);
  assert.equal(result.status,409);
  result=await handleInsuranceNetwork(req('/api/internal/network/affiliations/aff_lotte-primary','PUT',{carrierKey:'lotte',carrierName:'Lotte',relationshipType:'planner',status:'active',registrationReference:'1234567',verificationUrl:'https://example.com/verify',publicEnabled:true}),env);
  assert.equal(result.status,200);
  const snapshot=await publicPracticeSnapshot(env);
  assert.equal(snapshot.affiliations.length,1);
  assert.equal(snapshot.affiliations[0].id,'aff_lotte-primary');
});

test('consultation projection links only to an active public affiliation',async()=>{
  const db=new DatabaseSync(':memory:'); migrate(db); const env={DB:new D1(db),INSURANCE_INTERNAL_TOKEN:'test-token'}; const now=new Date().toISOString();
  db.prepare(`INSERT INTO consultation_requests(id,contact_name,contact_ciphertext,contact_hint,preferred_time,ai_summary,transcript_shared,status,access_token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('con_practice','Customer','cipher','***-***-0000','','General',0,'new','hash',now,now);
  assert.equal(await linkConsultationAffiliation(env,'con_practice','aff_lotte-primary'),false);
  db.prepare(`UPDATE insurance_affiliations SET status='active',registration_reference='1234567',verification_url='https://example.com/verify',public_enabled=1,updated_at=? WHERE id='aff_lotte-primary'`).run(now);
  assert.equal(await linkConsultationAffiliation(env,'con_practice','aff_lotte-primary'),true);
  const row=db.prepare('SELECT stage FROM insurance_consultation_projections WHERE consultation_id=? AND affiliation_id=?').get('con_practice','aff_lotte-primary');
  assert.equal(row.stage,'queued');
});
