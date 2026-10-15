import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../ai-control-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migrations=[
  'migrations/0130_ai_assistance_requests.sql',
  'migrations/0131_ai_assistance_quotes.sql',
  'migrations/0132_ai_assistance_quote_integrity.sql'
];
const merchantEmail='merchant-test@example.invalid';
const envConfig={
  SUPABASE_URL:'https://supabase-test.invalid',SUPABASE_PUBLISHABLE_KEY:'synthetic-local-key',
  EKODIBIZ_LEGAL_NAME:'테스트 에코디비즈',EKODIBIZ_REPRESENTATIVE:'테스트 대표',
  EKODIBIZ_BUSINESS_NUMBER:'123-45-67890',EKODIBIZ_BUSINESS_ADDRESS:'테스트 계약서 주소',
  EKODIBIZ_CUSTOMER_SERVICE:'help@example.invalid',
  EKODIBIZ_ASSISTANCE_TERMS_URL:'https://ekodi.kr/ekodibiz/terms',
  EKODIBIZ_ASSISTANCE_REFUND_URL:'https://ekodi.kr/ekodibiz/refund',
  EKODIBIZ_PRIVACY_POLICY_URL:'https://ekodi.kr/privacy',
  EKODIBIZ_ASSISTANCE_TERMS_VERSION:'synthetic-contract-v1',
  EKODIBIZ_ASSISTANCE_CONTRACT_APPROVED:'true',
  EKODIBIZ_ASSISTANCE_RETENTION_DAYS:'90',
  EKODIBIZ_ASSISTANCE_QUOTE_APPROVERS:merchantEmail
};
function makeD1(){
  const sql=new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  for(const migration of migrations)sql.exec(read(migration));
  const bind=(query,params=[])=>({
    query,params,
    bind(...values){return bind(query,values)},
    async first(){return sql.prepare(query).get(...params)??null},
    async all(){return {results:sql.prepare(query).all(...params)}},
    async run(){const out=sql.prepare(query).run(...params);return {success:true,meta:{changes:out.changes}}}
  });
  return {sql,DB:{
    prepare(query){return bind(query)},
    async batch(statements){
      sql.exec('BEGIN IMMEDIATE');
      try{
        const results=statements.map(({query,params})=>{
          const out=sql.prepare(query).run(...params);
          return {success:true,meta:{changes:out.changes}};
        });
        sql.exec('COMMIT');return results;
      }catch(error){sql.exec('ROLLBACK');throw error}
    }
  }};
}
function authResponse(request){
  const token=new Headers(request.headers).get('authorization')?.replace(/^Bearer\s+/i,'');
  const users={
    'synthetic-member-a':{id:'user-a',email:'a@example.invalid'},
    'synthetic-member-b':{id:'user-b',email:'b@example.invalid'},
    'synthetic-admin':{id:'super-admin',email:merchantEmail}
  };
  return users[token]?Response.json(users[token]):Response.json({error:'invalid_session'},{status:401});
}
async function invoke(env,method,path,token='',body){
  const headers=new Headers();
  if(token)headers.set('authorization','Bearer '+token);
  if(body!==undefined)headers.set('content-type','application/json');
  const request=new Request('https://ekodi.kr'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const response=await worker.fetch(request,env,{waitUntil(){}});
  const text=await response.text();
  let data;
  try{data=JSON.parse(text)}catch{data={raw:text.slice(0,250)}}
  return {status:response.status,data};
}
test('live Worker API with synthetic Supabase/central identities and actual isolated SQLite D1 schema',async()=>{
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    if(String(url)==='https://supabase-test.invalid/auth/v1/user')return authResponse({headers:options.headers});
    throw new Error('unexpected network request during isolated E2E: '+String(url));
  };
  const {sql,DB}=makeD1();
  const env={...envConfig,DB,CONTROL_API:{fetch:async request=>{
    const token=request.headers.get('authorization')||'';
    return token==='Bearer synthetic-admin'
      ?Response.json({authenticated:true,role:'super_admin',email:merchantEmail})
      :Response.json({authenticated:false},{status:401});
  }}};
  const base='/api/commons/assistance';
  try{
    for(const path of [base+'/requests',base+'/requests/11111111-1111-1111-1111-111111111111',
        '/api/commons/admin/assistance/requests']){
      assert.equal((await invoke(env,'GET',path)).status,401,path+' anonymous restriction');
    }
    const payload={
      noticeId:'notice-123',noticeTitle:'가상 정부 AI 도입 지원사업',
      noticeSource:'official-demo',noticeUrl:'https://www.bizinfo.go.kr/',
      planIds:['eligibility','information'],applicantName:'홍길동',
      scopeAcknowledged:true,privacyAcknowledged:true,precontractAcknowledged:true
    };
    const created=await invoke(env,'POST',base+'/requests','synthetic-member-a',payload);
    assert.equal(created.status,201,JSON.stringify(created));assert.equal(created.data.paymentInitiated,false);
    const id=created.data.id;assert.match(id,/^[a-f0-9-]{36}$/);
    const ownerList=await invoke(env,'GET',base+'/requests','synthetic-member-a');
    assert.equal(ownerList.status,200);assert.equal(ownerList.data.requests.length,1);
    assert.equal(ownerList.data.requests[0].id,id);
    const otherList=await invoke(env,'GET',base+'/requests','synthetic-member-b');
    assert.equal(otherList.status,200);assert.equal(otherList.data.requests.length,0);
    assert.equal((await invoke(env,'GET',base+'/requests/'+id,'synthetic-member-b')).status,404);
    assert.equal((await invoke(env,'GET','/api/commons/admin/assistance/requests','synthetic-member-a')).status,403);
    const adminList=await invoke(env,'GET','/api/commons/admin/assistance/requests','synthetic-admin');
    assert.equal(adminList.status,200,JSON.stringify(adminList));
    assert.equal(adminList.data.requests.length,1);
    assert.equal(adminList.data.contractPolicy.ready,true);
    const expiresAt=new Date(Date.now()+7*86400000).toISOString();
    const quoteRequest={lineItems:[{id:'eligibility',amount:330000},{id:'information',amount:0}],
      vatIncluded:true,deliveryDays:14,expiresAt,notes:'가상 데이터 테스트'};
    const issued=await invoke(env,'POST','/api/commons/admin/assistance/requests/'+id+'/quote','synthetic-admin',quoteRequest);
    assert.equal(issued.status,201,JSON.stringify(issued));
    assert.equal(issued.data.totalAmount,330000);assert.equal(issued.data.paymentEnabled,false);
    assert.equal((await invoke(env,'POST','/api/commons/admin/assistance/requests/'+id+'/quote','synthetic-admin',quoteRequest)).status,409);
    const detail=await invoke(env,'GET',base+'/requests/'+id,'synthetic-member-a');
    assert.equal(detail.status,200);assert.equal(detail.data.quote.snapshot.totalAmount,330000);
    assert.equal(detail.data.quote.snapshot.request.noticeId,'notice-123');
    assert.equal(detail.data.quote.snapshot.request.applicantName,'홍길동');
    assert.equal(detail.data.payment.enabled,false);
    const acknowledgment={digest:detail.data.quote.digest,typedName:'홍길동',
      termsAccepted:true,refundAcknowledged:true,privacyAcknowledged:true,nonBindingAcknowledged:true};
    const acknowledgePath=base+'/requests/'+id+'/acknowledge';
    assert.equal((await invoke(env,'POST',acknowledgePath,'synthetic-member-b',acknowledgment)).status,404);
    assert.equal((await invoke(env,'POST',acknowledgePath,'synthetic-member-a',{...acknowledgment,digest:'forged'})).status,409);
    const ack=await invoke(env,'POST',acknowledgePath,'synthetic-member-a',acknowledgment);
    assert.equal(ack.status,200,JSON.stringify(ack));
    assert.equal(ack.data.contractExecuted,false);
    assert.equal(ack.data.paymentConfirmed,false);
    assert.equal(ack.data.workStarted,false);
    assert.equal((await invoke(env,'POST',acknowledgePath,'synthetic-member-a',acknowledgment)).status,409);
    const final=await invoke(env,'GET',base+'/requests/'+id,'synthetic-member-a');
    assert.equal(final.data.request.state,'contract_pending');
    assert.equal(final.data.quote.status,'acknowledged');
    assert.equal(sql.prepare('SELECT COUNT(*) count FROM ai_assistance_events WHERE request_id=?').get(id).count,2);
    // Simulate simultaneous stale state: SQLite itself must ABORT a quote/contract drift.
    const second=await invoke(env,'POST',base+'/requests','synthetic-member-b',payload);
    assert.equal(second.status,201,JSON.stringify(second));
    const id2=second.data.id;
    assert.throws(()=>sql.prepare("UPDATE ai_assistance_requests SET state='contract_pending' WHERE id=?").run(id2),
      /assistance_contract_pending_requires_review/);
    assert.throws(()=>sql.prepare("INSERT INTO ai_assistance_events(id,request_id,actor_id,kind,event_json,created_at) VALUES('unauthorized',?,'user-b','quote_acknowledged','{}',?)").run(id2,new Date().toISOString()),
      /assistance_event_requires_confirmed_quote/);
    const history=sql.prepare('SELECT kind FROM ai_assistance_events ORDER BY created_at').all().map(x=>x.kind);
    assert.ok(history.includes('quote_issued')&&history.includes('quote_acknowledged'));
    console.log(JSON.stringify({ok:true,mode:'isolated-d1-real-worker-synthetic-identity',
      requestAndHistory:201,quoteIssue:201,customerReview:200,crossMemberRead:404,anonymousRead:401,
      customerSigned:false,payment:false,workStarted:false,d1IntegrityTriggers:true}));
  }finally{globalThis.fetch=oldFetch;sql.close()}
});
