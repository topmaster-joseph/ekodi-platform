import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { handleInvestAutopilotApi } from '../invest-autopilot-runtime.js';
import { investMyRoute } from '../invest-my-workspace.js';

const OWNER='owner@example.com',STEP='S'.repeat(43),SUB='owner-uuid',KEY='k'.repeat(40);
const makeJwt=(aal='aal2')=>{
 const payload={iss:'https://renzehysxirjilvdxacv.supabase.co/auth/v1',sub:SUB,aal,
   session_id:'session-id-test-001',iat:Math.floor(Date.now()/1000)-60,exp:Math.floor(Date.now()/1000)+3600};
 return [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify(payload)).toString('base64url'),'testsignature'].join('.');
};
function env(){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0086_invest_autonomous_loop.sql','202610251300_invest_autopilot.sql','202610280100_invest_step_up.sql'])
   db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.prepare('INSERT INTO investment_step_up_sessions(token_hash,subject_email,expires_at,created_at) VALUES(?,?,?,?)')
   .run(crypto.createHash('sha256').update(STEP).digest('hex'),OWNER,'2099-01-01T00:00:00.000Z','2026-10-01T00:00:00.000Z');
 const stmt=(sql,args=[])=>({bind(...values){return stmt(sql,values)},async first(){return db.prepare(sql).get(...args)||null},
   async all(){return {results:db.prepare(sql).all(...args)}},
   async run(){const out=db.prepare(sql).run(...args);return {meta:{changes:Number(out.changes)}}}});
 return {DB:{prepare:sql=>stmt(sql)},ALLOW_MUTATIONS:'true',INVEST_OWNER_EMAIL:OWNER,INVEST_STEP_UP_REQUIRED:'true',
   ALLOWED_ORIGINS:'https://ekodi.kr',OPENDART_API_KEY:KEY};
}
async function call(e,{path='/v1/invest/autopilot/research/opendart/company?corp_code=00126380',jwt=makeJwt(),step=STEP,method='GET',providerBody}={}){
 let external=0,provider=0;
 const orig=globalThis.fetch;
 globalThis.fetch=async (input)=>{
  const url=typeof input==='string'?input:String(input?.url||input);
  if(url.startsWith('https://opendart.fss.or.kr/api/')){
    provider++;
    return new Response(JSON.stringify(providerBody??{status:'000',corp_name:'테스트상장사',stock_code:'005930'}),
      {headers:{'content-type':'application/json'}});
  }
  external++;
  return new Response(JSON.stringify({id:SUB,email:OWNER,email_confirmed_at:'2026-10-01T00:00:00Z'}),
    {status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const headers={origin:'https://ekodi.kr'};
  if(jwt)headers.authorization='Bearer '+jwt;
  if(step)headers['x-ekodi-invest-step-up']=step;
  const res=await handleInvestAutopilotApi(new Request('https://ekodi.kr'+path,{method,headers}),e);
  return {status:res.status,body:await res.json(),external,provider};
 }finally{globalThis.fetch=orig}
}
test('anonymous, step-up missing and non-AAL2 users trigger zero DART API traffic',async()=>{
 const e=env();
 const anonymous=await call(e,{jwt:null});
 assert.equal(anonymous.status,401);assert.equal(anonymous.provider,0);
 const noStep=await call(e,{step:null});
 assert.equal(noStep.status,403);assert.equal(noStep.provider,0);
 const aal1=await call(e,{jwt:makeJwt('aal1')});
 assert.equal(aal1.status,403);assert.equal(aal1.body.error,'STRONG_MFA_AAL2_REQUIRED');assert.equal(aal1.provider,0);
});
test('owner AAL2 uses server vault and fixed OpenDART fetch; no key or order in response',async()=>{
 const e=env();
 const got=await call(e);
 assert.equal(got.status,200);
 assert.equal(got.provider,1);
 assert.equal(got.body.provider,'OpenDART');
 assert.equal(got.body.company.stockCode,'005930');
 assert.equal(got.body.ordersPlaced,false);
 assert.equal(got.body.valuationReady,false);
 assert.doesNotMatch(JSON.stringify(got.body),new RegExp(KEY));
 const missing=await call({...e,OPENDART_API_KEY:''});
 assert.equal(missing.status,503);assert.equal(missing.body.error,'OPENDART_NOT_CONFIGURED');assert.equal(missing.provider,0);
});
test('statement endpoint rejects invalid issuer before sending provider request',async()=>{
 const e=env();
 const bad=await call(e,{path:'/v1/invest/autopilot/research/opendart/financials?corp_code=005930&year=2025&report=11011'});
 assert.equal(bad.status,400);assert.equal(bad.body.error,'INVALID_CORP_CODE');assert.equal(bad.provider,0);
 const read=await call(e,{path:'/v1/invest/autopilot/research/opendart/financials?corp_code=00126380&year=2025&report=11011&fs=CFS',
 providerBody:{status:'000',list:[{sj_div:'BS',account_nm:'자산총계',thstrm_amount:'1,500',currency:'KRW',rcept_no:'20260331000123'}]}});
 assert.equal(read.status,200);assert.equal(read.provider,1);
 assert.equal(read.body.officialRows[0].currentAmount,'1500');
 assert.equal(read.body.liveOrdersEnabled,false);assert.equal(read.body.valuationReady,false);
});
test('owner screen includes manually invoked official disclosures with DOM-only rendering',async()=>{
 const html=await (await investMyRoute(new Request('https://ekodi.kr/invest'),{})).text();
 const js=await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{})).text();
 for(const id of ['dartResearchForm','dartCorpCode','dartFinancialYear','dartResearchSubmit','dartResearchResults'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/\/research\/opendart\/company/);
 assert.match(js,/\/research\/opendart\/financials/);
 assert.match(js,/loadOpenDartOfficial/);
 assert.doesNotMatch(js,/innerHTML/);
});
