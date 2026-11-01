import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePointsControl} from '../points-control.js';

const key='test-server-only-key';
const base='https://ekodi.kr/api/control/points';
const env={POINTS_POLICY_READ_ENABLED:'true',POINTS_POLICY_WRITE_ENABLED:'true',POINTS_SOURCE_ENV:'production',
  POINTS_SUPABASE_URL:'https://renzehysxirjilvdxacv.supabase.co/',POINTS_SERVICE_ROLE_KEY:key};
const admin={role:'super_admin',email:'Owner@EKODI.kr'};
const reqId='3f2b8c1e-4a5d-4e6f-9a0b-1c2d3e4f5a6b';
const post=(path,body,headers={})=>new Request(base+path,{method:'POST',
  headers:{origin:'https://ekodi.kr','content-type':'application/json',...headers},body:JSON.stringify(body)});
const proposal={kind:'rule',target:{site_id:'my',rule_id:'attend'},
  proposed:{points:10,daily_cap:10,daily_events:1,min_active_seconds:0,enabled:true},
  reason:'weekly attendance pilot',request_key:'ui-20261031-0001'};
const never=()=>{throw Error('database must not be called');};

test('writes are default-off, same-origin, JSON and super-admin only',async()=>{
  assert.equal((await handlePointsControl(post('/requests',proposal),{...env,POINTS_POLICY_WRITE_ENABLED:undefined},admin,new Headers(),never)).status,503);
  assert.equal((await handlePointsControl(post('/requests',proposal,{origin:'https://evil.example'}),env,admin,new Headers(),never)).status,403);
  assert.equal((await handlePointsControl(post('/requests',proposal,{origin:''}),env,admin,new Headers(),never)).status,403);
  assert.equal((await handlePointsControl(post('/requests',proposal,{'content-type':'text/plain'}),env,admin,new Headers(),never)).status,415);
  assert.equal((await handlePointsControl(post('/requests',proposal),env,{role:'admin',email:'a@b.kr'},new Headers(),never)).status,403);
  assert.equal((await handlePointsControl(post('/requests',proposal),env,{role:'super_admin'},new Headers(),never)).status,403);
  assert.equal((await handlePointsControl(new Request(base+'/requests'),env,admin,new Headers(),never)).status,405);
  assert.equal((await handlePointsControl(new Request(base+'/unknown'),env,admin,new Headers(),never)).status,404);
});

test('proposal is validated before reaching the database',async()=>{
  for(const bad of [{...proposal,kind:'wallet'},{...proposal,reason:'no'},{...proposal,request_key:'x'},{...proposal,target:[]}]){
    assert.equal((await handlePointsControl(post('/requests',bad),env,admin,new Headers(),never)).status,400);
  }
  assert.equal((await handlePointsControl(post('/requests/not-a-uuid/decision',{approve:true}),env,admin,new Headers(),never)).status,400);
  assert.equal((await handlePointsControl(post('/requests/'+reqId+'/decision',{approve:'yes'}),env,admin,new Headers(),never)).status,400);
});

test('proposal calls the audited RPC with the server-derived actor, never a browser value',async()=>{
  let seen;
  const fetcher=async(url,opts)=>{
    seen={url,opts,args:JSON.parse(opts.body)};
    return new Response(JSON.stringify({request_id:reqId,status:'pending',risk:'standard',replayed:false}),{status:200});
  };
  const res=await handlePointsControl(post('/requests',{...proposal,actor:'ekodi-admin:spoof@x.kr'}),env,admin,new Headers(),fetcher);
  assert.equal(res.status,201);
  assert.equal(seen.url,'https://renzehysxirjilvdxacv.supabase.co/rest/v1/rpc/ekodi_points_admin_propose');
  assert.equal(seen.opts.redirect,'error');
  assert.equal(seen.opts.headers.apikey,key);
  assert.equal(seen.args.p_actor,'ekodi-admin:owner@ekodi.kr');
  assert.deepEqual(seen.args.p_target,proposal.target);
  assert.equal(seen.args.p_request_key,proposal.request_key);
});

test('decision maps known database refusals to 409 and hides unknown errors',async()=>{
  const refuse=msg=>async()=>new Response(JSON.stringify({message:msg}),{status:400});
  let res=await handlePointsControl(post('/requests/'+reqId+'/decision',{approve:true}),env,admin,new Headers(),refuse('SECOND_APPROVER_REQUIRED'));
  assert.equal(res.status,409);assert.equal((await res.json()).error,'SECOND_APPROVER_REQUIRED');
  res=await handlePointsControl(post('/requests/'+reqId+'/decision',{approve:true}),env,admin,new Headers(),refuse('relation "x" does not exist'));
  assert.equal(res.status,503);assert.equal((await res.json()).error,'points_governance_unavailable');
});

test('governance and member ledger reads are read-switch gated and validated',async()=>{
  assert.equal((await handlePointsControl(new Request(base+'/governance'),{...env,POINTS_POLICY_READ_ENABLED:'false'},admin,new Headers(),never)).status,503);
  assert.equal((await handlePointsControl(new Request(base+'/member-ledger?site=my&person=bad'),env,admin,new Headers(),never)).status,400);
  let args;
  const fetcher=async(url,opts)=>{args=JSON.parse(opts.body);return new Response('{"entries":[]}',{status:200});};
  const res=await handlePointsControl(new Request(base+'/member-ledger?site=my&person='+reqId+'&limit=9999'),env,admin,new Headers(),fetcher);
  assert.equal(res.status,200);assert.equal(args.p_limit,200);assert.equal(args.p_actor,'ekodi-admin:owner@ekodi.kr');
});

test('governance cannot reach development data from canonical production host',async()=>{
  const res=await handlePointsControl(new Request(base+'/governance'),{...env,POINTS_SOURCE_ENV:'development',
    POINTS_SUPABASE_URL:'https://lxcxwbdwwojjkgybbqii.supabase.co/'},admin,new Headers(),never);
  assert.equal(res.status,503);
});

import {readFileSync} from 'node:fs';
test('governance UI only talks to same-origin admin API and renders data as text',()=>{
  const ui=readFileSync(new URL('../points-governance-admin.js',import.meta.url),'utf8');
  const view=readFileSync(new URL('../points-admin.js',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
  const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  assert.match(ui,/const API='\/api\/control\/points'/);
  assert.match(ui,/credentials:'same-origin'/);
  assert.match(ui,/request_key:'ui-'\+requestKey\(\)/);assert.match(ui,/crypto\.getRandomValues/);
  assert.doesNotMatch(ui,/supabase\.co|sb_publishable_|service_role|balance\s*=/);
  assert.doesNotMatch(ui,/innerHTML\s*=\s*[^`]/); // only the static template uses innerHTML
  assert.match(view,/points-governance-admin\.js/);
  assert.match(worker,/'\/points-governance-admin\.js'/);
  assert.match(build,/'points-governance-admin\.js'/);
});

test('P2 routes: scan is read-gated, claim/anomaly decisions are write-gated and validated',async()=>{
  const id='3f2b8c1e-4a5d-4e6f-9a0b-1c2d3e4f5a6b';
  assert.equal((await handlePointsControl(new Request(base+'/scan'),{...env,POINTS_POLICY_READ_ENABLED:'false'},admin,new Headers(),never)).status,503);
  assert.equal((await handlePointsControl(post('/claims/'+id+'/decision',{approve:true}),{...env,POINTS_POLICY_WRITE_ENABLED:'false'},admin,new Headers(),never)).status,503);
  assert.equal((await handlePointsControl(post('/claims/bad/decision',{approve:true}),env,admin,new Headers(),never)).status,400);
  assert.equal((await handlePointsControl(post('/anomalies/0/resolve',{status:'resolved'}),env,admin,new Headers(),never)).status,400);
  assert.equal((await handlePointsControl(post('/anomalies/12/resolve',{status:'deleted'}),env,admin,new Headers(),never)).status,400);
  assert.equal((await handlePointsControl(post('/anomalies/12/resolve',{status:'resolved'},{origin:'https://evil.example'}),env,admin,new Headers(),never)).status,403);
  const calls=[];
  const fetcher=async(url,opts)=>{calls.push([new URL(url).pathname,JSON.parse(opts.body)]);return new Response('{"ok":true}',{status:200});};
  await handlePointsControl(new Request(base+'/scan'),env,admin,new Headers(),fetcher);
  await handlePointsControl(post('/claims/'+id+'/decision',{approve:false,note:'not verified'}),env,admin,new Headers(),fetcher);
  await handlePointsControl(post('/anomalies/12/resolve',{status:'acknowledged'}),env,admin,new Headers(),fetcher);
  await handlePointsControl(post('/requests',{kind:'adapter',target:{site_id:'my',rule_id:'content',adapter:'content_approval'},
    proposed:{trust:'verified',member_claimable:true,enabled:false},reason:'register adapter',request_key:'ui-adapter-0001'}),env,admin,new Headers(),fetcher);
  assert.deepEqual(calls.map(c=>c[0]),['/rest/v1/rpc/ekodi_points_admin_scan','/rest/v1/rpc/ekodi_points_admin_decide_claim',
    '/rest/v1/rpc/ekodi_points_admin_resolve_anomaly','/rest/v1/rpc/ekodi_points_admin_propose_adapter']);
  for(const [,args] of calls)assert.equal(args.p_actor,'ekodi-admin:owner@ekodi.kr');
  assert.equal(calls[2][1].p_anomaly,12);
});
