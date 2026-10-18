import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runCanary} from '../scripts/verify-seonammedi-live-google-crud-canary.mjs';

const writer='synthetic-writer-long-Google-token-not-a-real-credential-123';
const admin='synthetic-admin-long-Google-token-not-a-real-credential-789';
const urlPath='/api/voices-fresh';

function mockProduction(){
  const entries=[],calls=[];let nextId=1;
  const fetchFn=async(resource,options={})=>{
    const url=new URL(String(resource));
    assert.ok(['seonammedi.kr','ekodi.kr'].includes(url.hostname));
    const origin=new URL(resource).origin;
    const path=url.pathname.slice(url.pathname.indexOf('/api/'));
    const token=String(options.headers?.authorization||'').replace(/^Bearer /,'');
    const role=token===writer?'writer':token===admin?'admin':'guest';
    const method=options.method||'GET';
    calls.push({origin,path,role,method});
    if(path==='/api/auth/session'){
      return Response.json({ok:true,authenticated:true,provider:'google',
        email:role+'@example.test'});
    }
    if(path===urlPath+'/admin'){
      return role==='admin'?Response.json({ok:true,items:entries.filter(x=>!x.deleted)}):
        Response.json({ok:false,error:'voices_forbidden'},{status:403});
    }
    if(path===urlPath&&method==='POST'){
      assert.equal(role,'writer');
      const data=JSON.parse(options.body);
      assert.match(data.message,/^EKODI-SEONAM-LIVE-GOOGLE-CANARY-/);
      const id=nextId++;
      const submissionId='00000000-0000-4000-8000-'+String(id).padStart(12,'0');
      entries.push({id,message:data.message,submissionId,deleted:false});
      return Response.json({ok:true,queued:true,submissionId},{status:202});
    }
    const status=path.match(/^\/api\/voices-fresh\/submissions\/([a-f0-9-]{36})$/i);
    if(status){
      const row=entries.find(x=>x.submissionId===status[1]);
      return Response.json({ok:true,status:row?'published':'pending',id:row?.id});
    }
    const item=path.match(/^\/api\/voices-fresh\/(\d+)$/);
    if(item&&method==='PUT'){
      assert.equal(role,'admin');
      const row=entries.find(x=>x.id===Number(item[1]));
      row.message=JSON.parse(options.body).message;
      return Response.json({ok:true,id:row.id});
    }
    if(item&&method==='DELETE'){
      assert.equal(role,'admin');
      const row=entries.find(x=>x.id===Number(item[1]));
      row.deleted=true;
      return Response.json({ok:true,id:row.id});
    }
    if(path===urlPath&&method==='GET'){
      const q=url.searchParams.get('q')||'';
      return Response.json({ok:true,items:entries.filter(x=>!x.deleted&&(!q||x.message.includes(q))).map(x=>({id:x.id,message:x.message}))});
    }
    throw Error('unexpected_fake_request_'+method+'_'+path);
  };
  return {entries,calls,fetchFn};
}
test('real Google E2E canary requires two separately supplied valid-length tokens and trusted run context',async()=>{
  const {fetchFn,calls}=mockProduction();
  await assert.rejects(()=>runCanary({writerToken:'',adminToken:admin,runId:'12345',fetchFn}),/writer_Google_token_missing/);
  await assert.rejects(()=>runCanary({writerToken:writer,adminToken:'',runId:'12345',fetchFn}),/admin_Google_token_missing/);
  await assert.rejects(()=>runCanary({writerToken:writer,adminToken:writer,runId:'12345',fetchFn}),/must_be_distinct/);
  await assert.rejects(()=>runCanary({writerToken:writer,adminToken:admin,runId:'unknown',fetchFn}),/workflow_run_id_missing/);
  assert.equal(calls.length,0,'missing real credentials must fail before network traffic');
});
test('two host user-to-admin production canary verifies readback and soft-deletes only uniquely marked synthetic rows',async()=>{
  const {entries,calls,fetchFn}=mockProduction(),messages=[];
  const result=await runCanary({writerToken:writer,adminToken:admin,runId:'123456789',
    fetchFn,sleep:async()=>{},log:x=>messages.push(x)});
  assert.deepEqual(result,{ok:true,hosts:2,postsCreated:2,postsCleaned:2});
  assert.equal(entries.length,2);
  assert.ok(entries.every(x=>x.deleted&&x.message.endsWith('-EDITED')));
  assert.deepEqual([...new Set(entries.map(x=>x.id))],[1,2]);
  assert.equal(calls.filter(x=>x.method==='POST').length,2);
  assert.equal(calls.filter(x=>x.method==='PUT').length,2);
  assert.equal(calls.filter(x=>x.method==='DELETE').length,2);
  assert.ok(calls.some(x=>x.path.endsWith('/admin')&&x.role==='writer'));
  assert.ok(calls.some(x=>x.path.endsWith('/admin')&&x.role==='admin'));
  assert.ok(messages.some(x=>x.includes('PASS: real Google writer queued CRUD')));
  assert.ok(messages.every(x=>!x.includes(writer)&&!x.includes(admin)&&!x.includes('@example.test')));
});
test('production job is explicitly owner-initiated, operates on main only and never supplies synthetic credentials',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/verify-seonammedi-live-google-crud.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/schedule:|pull_request_target:|issue_comment:|push:/);
  assert.match(workflow,/refs\/heads\/main/);
  assert.match(workflow,/secrets\.SEONAMMEDI_BOARD_CANARY_GOOGLE_TOKEN/);
  assert.match(workflow,/secrets\.SEONAMMEDI_BOARD_CANARY_ADMIN_GOOGLE_TOKEN/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/node scripts\/verify-seonammedi-live-google-crud-canary\.mjs/);
  assert.doesNotMatch(workflow,/wrangler|cloudflare|supabase.*service_role/);
});
