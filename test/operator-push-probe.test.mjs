import './support-cloudflare-workers-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sendOperatorPush,operatorPushDiagnostics} from '../operator-push.js';

const JWK=JSON.stringify({kty:'EC',crv:'P-256',x:'a',y:'a',d:'a'});
const a='topmaster.joseph@gmail.com';
const b='joseph@ekodi.kr';
const rows=[
  {id:'a1',owner_email:a,endpoint:'https://fcm.googleapis.com/fcm/send/test-a',last_sent_at:null,last_status:null},
  {id:'b1',owner_email:b,endpoint:'https://fcm.googleapis.com/fcm/send/test-b',last_sent_at:'2026-11-21T00:00:00Z',last_status:503}
];
function fixture(){
  const sent=[];
  const changes=[];
  const db={
    prepare(sql){
      if(sql.startsWith('CREATE TABLE'))return{run:async()=>({})};
      if(sql.startsWith('SELECT * FROM operator_push_devices')){
        return{all:async()=>({results:rows}),bind(email){return{all:async()=>({results:rows.filter(row=>row.owner_email===email)})}}};
      }
      if(sql.startsWith('SELECT COUNT(*) AS devices')){
        return{bind(email){return{first:async()=>({devices:rows.filter(row=>row.owner_email===email).length,
          lastAttemptAt:rows.find(row=>row.owner_email===email)?.last_sent_at||null,
          acceptedDeviceCount:0,failedDeviceCount:email===b?1:0})}}};
      }
      if(sql.startsWith('UPDATE operator_push_devices'))
        return{bind(...values){return{run:async()=>{changes.push(values);return {}}}}};
      throw Error('Unexpected SQL: '+sql.slice(0,70));
    }
  };
  return{db,sent,changes};
}
test('operator self-test targets only caller-owned devices, never all devices',async()=>{
  const f=fixture();
  const r=await sendOperatorPush({DB:f.db,NOTIFICATION_VAPID_PUBLIC_KEY:'public',
    NOTIFICATION_VAPID_PRIVATE_JWK:JWK},
    {title:'안전한 시험',body:'실기기 수신은 별도 확인',targetPath:'/mail/admin',operatorEmail:a},
    {sendWebPush:async row=>{f.sent.push(row.id);return{ok:true,status:201}}});
  assert.deepEqual(r,{ok:true,sent:1});
  assert.deepEqual(f.sent,['a1']);
  assert.equal(f.changes.length,1);
});

test('unapproved target email never sends, and gateway statuses do not prove receipt',async()=>{
  const f=fixture();
  const r=await sendOperatorPush({DB:f.db,NOTIFICATION_VAPID_PUBLIC_KEY:'public',
    NOTIFICATION_VAPID_PRIVATE_JWK:JWK},
    {title:'t',body:'b',targetPath:'/mail/admin',operatorEmail:'other@example.com'},
    {sendWebPush:async row=>{f.sent.push(row.id);return{ok:true,status:201}}});
  assert.equal(r.code,'OPERATOR_PUSH_OWNER_NOT_ALLOWED');
  assert.deepEqual(f.sent,[]);
  assert.equal(f.changes.length,0);
  const stats=await operatorPushDiagnostics(f.db,b);
  assert.equal(stats.devices,1);
  assert.equal(stats.failedDeviceCount,1);
  assert.equal(stats.deviceReceiptVerified,false);
});

test('phone test is explicitly initiated, login/email/origin/rate limited',()=>{
  const api=readFileSync(new URL('../mail-control.js',import.meta.url),'utf8');
  const page=readFileSync(new URL('../mail-admin-page.js',import.meta.url),'utf8');
  assert.match(api,/url\.pathname==='\/api\/mail\/control\/operator-push\/test'/);
  assert.match(api,/!actor\.emailVerified\|\|!operatorPushEmails\(env\)\.includes\(actor\.email\)/);
  assert.match(api,/request\.headers\.get\('origin'\)!=='https:\/\/ekodi\.kr'/);
  assert.match(api,/env\.AUTH_RATE_LIMITER\.limit/);
  assert.match(api,/Date\.now\(\)-Date\.parse\(diagnostics\.lastAttemptAt\)<120000/);
  assert.match(api,/operatorEmail:actor\.email/);
  assert.match(api,/deviceReceiptVerified:false/);
  assert.match(page,/id="opPushTestBtn"/);
  assert.match(page,/api\('\/operator-push\/test',\{method:'POST'\}\)/);
  assert.match(page,/휴대전화 잠금화면/);
});
