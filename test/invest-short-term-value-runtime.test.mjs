import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { handleInvestAutopilotApi } from '../invest-autopilot-runtime.js';
import { investMyRoute } from '../invest-my-workspace.js';

const OWNER='owner@example.com',STEP='S'.repeat(43);
function fakeEnv(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of ['0086_invest_autonomous_loop.sql','202610251300_invest_autopilot.sql','202610280100_invest_step_up.sql'])
   sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO investment_step_up_sessions(token_hash,subject_email,expires_at,created_at) VALUES(?,?,?,?)')
   .run(crypto.createHash('sha256').update(STEP).digest('hex'),OWNER,'2099-01-01T00:00:00.000Z','2026-10-01T00:00:00.000Z');
 const st=(sql,p=[])=>({bind(...v){return st(sql,v)},async first(){return sqlite.prepare(sql).get(...p)||null},
   async all(){return {results:sqlite.prepare(sql).all(...p)}},async run(){const r=sqlite.prepare(sql).run(...p);return {meta:{changes:Number(r.changes)}}}});
 return {DB:{prepare:sql=>st(sql)},ALLOW_MUTATIONS:'true',
   INVEST_OWNER_EMAIL:OWNER,INVEST_STEP_UP_REQUIRED:'true',ALLOWED_ORIGINS:'https://ekodi.kr'};
}
async function req(env,{method='GET',step=STEP,authorized=true,body}={}){
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({id:'owner-uuid',email:OWNER,email_confirmed_at:'2026-10-01T00:00:00Z'}),{status:200});
 try{
   const headers={origin:'https://ekodi.kr'};
   if(authorized)headers.authorization='Bearer '+'t'.repeat(40);
   if(step)headers['x-ekodi-invest-step-up']=step;
   if(body)headers['content-type']='application/json';
   const response=await handleInvestAutopilotApi(new Request('https://ekodi.kr/v1/invest/autopilot/research/short-term-value',
     {method,headers,body:body?JSON.stringify(body):undefined}),env);
   return {status:response.status,body:await response.json()};
 }finally{globalThis.fetch=oldFetch;}
}
test('owner-only research readiness reports providers without leaking keys or enabling orders',async()=>{
 const env=fakeEnv();
 env.OPENDART_API_KEY='private-DART-test-key';
 env.KIS_APP_KEY='private-app-key';
 env.KIS_APP_SECRET='private-app-secret';
 env.KIS_ACCOUNT_NO='50000000-01';
 const yes=await req(env);
 assert.equal(yes.status,200);
 assert.equal(yes.body.requirements.opendartServerKeyConfigured,true);
 assert.equal(yes.body.requirements.kisVaultConfigured,true);
 assert.equal(yes.body.requirements.kisReadOnlyConfigured,false,'vault secrets alone cannot connect');
 assert.equal(yes.body.liveOrdersEnabled,false);
 assert.equal(yes.body.dataReady,false);
 assert.doesNotMatch(JSON.stringify(yes.body),/private-|50000000/);
 const stepMissing=await req(env,{step:null});
 assert.equal(stepMissing.status,403);
 assert.equal(stepMissing.body.error,'STEP_UP_REQUIRED');
 const unknown=await req(env,{authorized:false});
 assert.equal(unknown.status,401);
});
test('owner POST analysis without Supabase AAL2 fails closed and never writes a trade',async()=>{
 const env=fakeEnv();
 const bad=await req(env,{method:'POST',body:{candidates:[]}});
 assert.equal(bad.status,403);
 assert.equal(bad.body.error,'STRONG_MFA_AAL2_REQUIRED');
 assert.equal(bad.body.ordersPlaced,false);
 const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM investment_autopilot_orders').first();
 assert.equal(count.total,0);
});

test('private research tab reports KIS and OpenDART readiness without exposing order controls',async()=>{
 const html=await (await investMyRoute(new Request('https://ekodi.kr/invest'),{})).text();
 const js=await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{})).text();
 assert.match(html,/id="shortValueResearch"/);
 assert.match(html,/id="shortValueRefresh"/);
 assert.match(html,/id="shortValueChecks"/);
 assert.match(html,/단기 가치발굴/);
 assert.match(js,/\/research\/short-term-value/);
 assert.match(js,/research:\[\['strategyLab','AI 전략 연구'\],\['shortValueResearch','단기 가치발굴'\]\]/);
 assert.match(js,/loadShortValueReadiness\(/);
 assert.doesNotMatch(js,/innerHTML/);
});
