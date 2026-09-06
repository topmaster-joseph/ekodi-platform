import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleInsuranceNetwork, linkAdvisorConsultation, networkReady } from '../sites/ekodi-insurance/api/network.js';

class Statement{constructor(stmt,args=[]){this.stmt=stmt;this.args=args}bind(...args){return new Statement(this.stmt,args)}async all(){return{results:this.stmt.all(...this.args)}}async first(){return this.stmt.get(...this.args)||null}async run(){return this.stmt.run(...this.args)}}
class D1{constructor(db){this.db=db}prepare(sql){return new Statement(this.db.prepare(sql))}}
function migrate(db){for(const name of ['0001_consultation_queue.sql','0002_revoke_minimization.sql','0003_partner_catalog_outcomes.sql','0004_advisor_profile.sql'])db.exec(fs.readFileSync(new URL(`../sites/ekodi-insurance/api/migrations/${name}`,import.meta.url),'utf8'))}
function req(path,method='GET',body){return new Request(`https://insurance.test${path}`,{method,headers:{'content-type':'application/json','x-ekodi-insurance-internal-token':'test-token'},body:body?JSON.stringify(body):undefined})}

test('personal advisor profile stays draft until identity and advertising review gates pass',async()=>{
  const db=new DatabaseSync(':memory:');migrate(db);const env={DB:new D1(db),INSURANCE_INTERNAL_TOKEN:'test-token'};
  assert.equal(await networkReady(env),true);
  let result=await handleInsuranceNetwork(req('/api/internal/network/advisor-profile'),env);
  assert.equal(result.body.profile.publicEnabled,false);assert.equal(result.body.profile.publishable,false);
  result=await handleInsuranceNetwork(req('/api/internal/network/advisor-profile','PUT',{displayName:'Test Advisor',insurerName:'롯데손해보험',roleLabel:'보험설계사',registrationReference:'1234567',verificationUrl:'https://www.lotteins.co.kr/web/C/D/C/cdc033re.jsp',officialCompanyUrl:'https://www.lotteins.co.kr/',publicEnabled:true}),env);
  assert.equal(result.status,409);
  result=await handleInsuranceNetwork(req('/api/internal/network/advisor-profile','PUT',{displayName:'Test Advisor',insurerName:'롯데손해보험',roleLabel:'보험설계사',intro:'기존 보험을 먼저 확인합니다.',registrationReference:'1234567',verificationUrl:'https://www.lotteins.co.kr/web/C/D/C/cdc033re.jsp',officialCompanyUrl:'https://www.lotteins.co.kr/',advertisingReviewRef:'review-2026-001',advertisingReviewExpiresAt:'2027-09-06',publicEnabled:true}),env);
  assert.equal(result.status,200);assert.equal(result.body.profile.publicEnabled,true);assert.equal(result.body.profile.publishable,true);
  result=await handleInsuranceNetwork(new Request('https://insurance.test/api/advisor/profile'),env);
  assert.equal(result.status,200);assert.equal(result.body.profile.insurerName,'롯데손해보험');assert.equal(result.body.profile.wonderOfficialUrl,'https://ntc.lotteins.co.kr/landing.do');
});

test('advisor consultation attribution is allowed only for a public verified profile',async()=>{
  const db=new DatabaseSync(':memory:');migrate(db);const env={DB:new D1(db),INSURANCE_INTERNAL_TOKEN:'test-token'};const now=new Date().toISOString();
  db.prepare(`INSERT INTO consultation_requests(id,contact_name,contact_ciphertext,contact_hint,preferred_time,ai_summary,transcript_shared,status,access_token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('con_advisor','고객','cipher','***-***-0000','','일반 보험관리 상담',0,'new','hash',now,now);
  assert.equal(await linkAdvisorConsultation(env,'con_advisor','adv_primary'),false);
  db.prepare(`UPDATE insurance_advisor_profiles SET display_name=?,registration_reference=?,advertising_review_ref=?,advertising_review_expires_at=?,public_enabled=1,updated_at=? WHERE id='adv_primary'`).run('Test Advisor','1234567','review-2026-001','2027-09-06',now);
  assert.equal(await linkAdvisorConsultation(env,'con_advisor','adv_primary'),true);
  const row=db.prepare('SELECT advisor_profile_id FROM insurance_advisor_consultation_links WHERE consultation_id=?').get('con_advisor');assert.equal(row.advisor_profile_id,'adv_primary');
});

test('advisor public and admin surfaces preserve personal-site compliance boundaries',()=>{
  const html=fs.readFileSync(new URL('../sites/ekodi-insurance/public/advisor.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../sites/ekodi-insurance/public/advisor.js',import.meta.url),'utf8');
  const worker=fs.readFileSync(new URL('../sites/ekodi-insurance/worker.js',import.meta.url),'utf8');
  const layout=fs.readFileSync(new URL('../admin-menu-layout.js',import.meta.url),'utf8');
  const build=fs.readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  const siteWorker=fs.readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
  const insuranceAdmin=fs.readFileSync(new URL('../insurance-admin.js',import.meta.url),'utf8');
  const advisorAdmin=fs.readFileSync(new URL('../insurance-advisor-admin.js',import.meta.url),'utf8');
  const proxy=fs.readFileSync(new URL('../insurance-control-proxy.js',import.meta.url),'utf8');
  for(const marker of ['보험회사 공식 홈페이지가 아닌 보험설계사 개인 안내·상담 페이지','모집인 정보를 확인','상담 요청'])assert.ok(html.includes(marker));
  assert.ok(js.includes('advisorProfileId:profile.id'));assert.ok(js.includes('shareTranscript:false'));assert.ok(js.includes('profile.directDesignUrl'));assert.ok(js.includes('profile.wonderOfficialUrl'));assert.ok(worker.includes("url.pathname==='/advisor'"));
  assert.ok(layout.includes("section==='insurance'")&&layout.includes("import('./insurance-admin.js')"));assert.ok(insuranceAdmin.includes("import('./insurance-advisor-admin.js')"));
  for(const asset of ['insurance-admin.js','insurance-network-admin.js','insurance-advisor-admin.js']){assert.ok(build.includes(asset));assert.ok(siteWorker.includes('/'+asset))}
  assert.ok(proxy.includes('/network/advisor-profile'));assert.ok(proxy.includes("['PATCH','PUT']"));
  for(const marker of ['본사 원더 업무','kr.co.lotteins.a2mars','고객등록 · 보장분석','본사 계약케어','COMPANION · READ ONLY'])assert.ok(advisorAdmin.includes(marker));
});
