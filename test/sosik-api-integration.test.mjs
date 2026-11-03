import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleSosikRequest } from '../sosik-api.js';

const base='https://api.ekodi.kr/api/sosik';
function buildDb(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/202611032335_sosik_unified_ministry_news.sql',import.meta.url),'utf8'));
  const prepare=query=>{
    const stmt=db.prepare(query);
    const wrap=params=>({
      first:async()=>stmt.get(...params)||null,
      all:async()=>({results:stmt.all(...params)}),
      run:async()=>{const r=stmt.run(...params);return{meta:{changes:Number(r.changes)}};},
      bind(...values){return wrap(values);},
    });
    return wrap([]);
  };
  return {native:db,prepare};
}
function env(){
  const DB=buildDb(),bucket=new Map();
  return {DB,AI_MULTI_PROVIDER_ENABLED:'false',ENVIRONMENT:'test',
    GMAIL_CLIENT_ID:'test',GMAIL_CLIENT_SECRET:'test',GMAIL_REFRESH_TOKEN:'test',
    LIVE_RECORDINGS_BUCKET:{
      put:async(k,b,opt)=>bucket.set(k,{body:b,httpMetadata:opt.httpMetadata}),
      get:async k=>bucket.get(k)||null,
    },
  };
}
async function api(path,{method='GET',data,token=true,origin='https://ekodi.kr',mime}={},config){
  const headers=new Headers({origin});
  if(token)headers.set('authorization','Bearer unit-test-owner-access-token');
  if(data!==undefined)headers.set('content-type',mime||'application/json');
  const payload=data===undefined?undefined:mime?data:JSON.stringify(data);
  const resp=await handleSosikRequest(new Request(base+path,{method,headers,body:payload}),config);
  const json=resp.headers.get('content-type')?.includes('application/json')?await resp.json():null;
  return {status:resp.status,data:json,response:resp};
}
test('end-to-end D1 integration: record -> scope -> consent -> approve -> test send -> dedupe',async()=>{
  const originalFetch=globalThis.fetch;
  let googleCalls=0,gmailCalls=0,aiCalls=0;
  globalThis.fetch=async(url,options)=>{
    const dest=String(url);
    if(dest.includes('/auth/v1/user')){
      googleCalls++;
      assert.ok((options?.headers?.authorization||'').startsWith('Bearer '));
      return Response.json({id:'owner-uuid',email:'topmaster.joseph@gmail.com',email_confirmed_at:'2026-10-10'});
    }
    if(dest.includes('oauth2.googleapis.com/token'))return Response.json({access_token:'mock-oauth'});
    if(dest.includes('gmail.googleapis.com/gmail/v1/users/me/messages/send')){
      gmailCalls++;const body=JSON.parse(options.body);assert.ok(body.raw?.length>100);
      return Response.json({id:'mock-message-'+gmailCalls});
    }
    aiCalls++;throw Error('unintended external call');
  };
  try{
    const config=env();
    let a=await api('/entries',{method:'POST',data:{organization:'church',kind:'meeting',date:'2026-11-03',title:'성경 나눔',body:'함께 말씀을 읽었습니다.',visibility:'public',peoplePresent:true,publicConsent:false}},config);
    assert.equal(a.status,201);const churchId=a.data.id;
    a=await api('/entries/'+churchId+'/publish',{method:'POST'},config);
    assert.equal(a.status,409);
    let feed=await api('/feed?org=church',{token:false},config);
    assert.equal(feed.data.items.length,0);
    a=await api('/entries/'+churchId,{method:'PUT',data:{organization:'church',kind:'meeting',date:'2026-11-03',title:'성경 나눔',body:'함께 말씀을 읽었습니다.',visibility:'public',peoplePresent:true,publicConsent:true,externalConsent:false}},config);
    assert.equal(a.status,200);
    a=await api('/entries/'+churchId+'/publish',{method:'POST'},config);
    assert.equal(a.status,200);
    feed=await api('/feed?org=church',{token:false},config);
    assert.equal(feed.data.items.length,1);
    const mission=await api('/entries',{method:'POST',data:{organization:'mission',kind:'prayer',date:'2026-11-03',title:'선교 기도',body:'감사',visibility:'supporters'}},config);
    assert.equal(mission.status,201);
    const joint=await api('/entries',{method:'POST',data:{organization:'joint',kind:'service',date:'2026-11-03',title:'공동 섬김',body:'이웃 돌봄',visibility:'public',publicConsent:true}},config);
    assert.equal(joint.status,201);
    await api('/entries/'+joint.data.id+'/publish',{method:'POST'},config);
    const churchFeed=(await api('/feed?org=church',{token:false},config)).data.items;
    const missionFeed=(await api('/feed?org=mission',{token:false},config)).data.items;
    assert.deepEqual(churchFeed.map(x=>x.title).sort(),['공동 섬김','성경 나눔'].sort());
    assert.deepEqual(missionFeed.map(x=>x.title),['공동 섬김']);
    const externalDenied=await api('/publications',{method:'POST',data:{organization:'church',audience:'fan',format:'letter',ids:[churchId],title:'외부 보고'}},config);
    assert.equal(externalDenied.status,409);
    const draft=await api('/publications',{method:'POST',data:{organization:'church',audience:'supporters',format:'letter',ids:[churchId,joint.data.id],title:'11월 사역소식'}},config);
    assert.equal(draft.status,201);
    assert.equal(draft.data.aiMode,'template');
    const key=draft.data.id;
    assert.equal((await api('/publications/'+key+'/send',{method:'POST'},config)).status,403);
    assert.equal((await api('/publications/'+key+'/test-send',{method:'POST'},config)).status,409);
    assert.equal((await api('/publications/'+key+'/approve',{method:'POST'},config)).status,200);
    assert.equal((await api('/publications/'+key+'/test-send',{method:'POST'},config)).status,200);
    assert.equal((await api('/publications/'+key+'/test-send',{method:'POST'},config)).status,409);
    const sameContent=await api('/publications',{method:'POST',data:{organization:'church',audience:'supporters',format:'letter',ids:[joint.data.id,churchId],title:'같은 내용 다시 발행'}},config);
    assert.equal(sameContent.status,201);
    assert.equal((await api('/publications/'+sameContent.data.id+'/approve',{method:'POST'},config)).status,200);
    const duplicateBlock=await api('/publications/'+sameContent.data.id+'/test-send',{method:'POST'},config);
    assert.equal(duplicateBlock.status,409);
    assert.equal(duplicateBlock.data.error,'DUPLICATE_CONTENT_SEND_BLOCKED');
    const deliveries=await api('/deliveries',{},config);
    assert.equal(deliveries.data.items.length,1);assert.equal(deliveries.data.items[0].status,'sent');
    assert.equal(mailer(),1);
    function mailer(){return gmailCalls;}
    const signup=await api('/subscribe',{method:'POST',token:false,data:{organization:'church',audience:'supporters',email:'donor@example.org',name:'홍길동',consent:true}},config);
    assert.equal(signup.status,202);
    const contacts=await api('/contacts?org=church',{},config);
    assert.equal(contacts.data.items.length,1);assert.equal(contacts.data.items[0].status,'pending');
    const missionContacts=await api('/contacts?org=mission',{},config);
    assert.equal(missionContacts.data.items.length,0);
    const contactId=contacts.data.items[0].id;
    assert.equal((await api('/contacts/'+contactId+'/activate',{method:'POST',data:{proof:'',consentAt:'2026-11-03'}},config)).status,400);
    assert.equal((await api('/contacts/'+contactId+'/activate',{method:'POST',data:{proof:'원본 서명 검증',consentAt:'2026-11-03'}},config)).status,200);
    const token=config.DB.native.prepare('SELECT unsubscribe_token FROM sosik_contacts WHERE id=?').get(contactId).unsubscribe_token;
    assert.equal((await api('/unsubscribe',{method:'POST',token:false,data:{token}},config)).status,200);
    assert.equal(config.DB.native.prepare('SELECT status FROM sosik_contacts WHERE id=?').get(contactId).status,'unsubscribed');
    assert.equal(aiCalls,0);assert.ok(googleCalls>0);
  }finally{globalThis.fetch=originalFetch;}
});
test('external-only entry cannot leak to supporters/prayer audience',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:'owner-id',email:'topmaster.joseph@gmail.com',email_confirmed_at:'now'});
  try{
    const config=env();
    const entry=await api('/entries',{method:'POST',data:{organization:'church',kind:'service',date:'2026-11-03',title:'외부보고 전용',body:'',visibility:'external',externalConsent:true}},config);
    assert.equal(entry.status,201);
    const draft=await api('/publications',{method:'POST',data:{organization:'church',audience:'supporters',format:'report',ids:[entry.data.id]}},config);
    assert.equal(draft.status,409);
  }finally{globalThis.fetch=original;}
});
