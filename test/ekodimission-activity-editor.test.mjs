import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleMissionActivityEditor,MISSION_ACTIVITY_EDITOR_PATH} from '../mission-activity-editor-api.js';
import spaceWorker from '../space-worker.js';

const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const env=()=>({
  DATA_ENABLED:'true',
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'publishable_test_only'
});
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const valid={
  key:'261010-naju-yeongsan',title:'가을 나눔 모임',summary:'함께 걷습니다.',
  venue:'에코디교회',date:'2026-11-07',time:'17:00',expectedRevision:0
};
const post=(body,auth='valid-jwt',origin='https://ekodi.kr')=>new Request('https://ekodi.kr'+MISSION_ACTIVITY_EDITOR_PATH,{
  method:'POST',headers:{origin,...(auth?{authorization:'Bearer '+auth}:{}),'content-type':'application/json'},
  body:JSON.stringify(body)
});
const gateway=(request,options={})=>handleMissionActivityEditor(request,env(),{
  respond:reply,
  publicRpc:async(name,args)=>options.publicRpc?.(name,args)||{ok:true,data:{ok:true,items:[]}}
});

test('public activity snapshot returns only approved editorial fields without auth',async()=>{
  const result=await gateway(new Request('https://ekodi.kr'+MISSION_ACTIVITY_EDITOR_PATH),{
    publicRpc:async(name,args)=>{
      assert.equal(name,'mission_activity_page_public_snapshot');
      assert.deepEqual(args,{p_workspace_slug:'ekodimission'});
      return {ok:true,data:{ok:true,items:[{key:'261010-naju-yeongsan',title:'가을 나눔',summary:'공개용 안내',venue:'교회',date:'2026-11-07',time:'17:00',revision:2}]}};
    }
  });
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.items.length,1);
  assert.ok(!JSON.stringify(data).includes('person_contacts'));
});

test('guest and cross-origin mutations fail before contacting database',async()=>{
  assert.equal((await gateway(post(valid,''))).status,401);
  assert.equal((await gateway(post(valid,'valid-jwt','https://evil.example'))).status,403);
  assert.equal((await gateway(post({...valid,date:'2026-02-30'}))).status,400);
  assert.equal((await gateway(post({...valid,time:'25:00'}))).status,400);
  assert.equal((await gateway(post({...valid,expectedRevision:-1}))).status,400);
  assert.equal((await gateway(post({...valid,venue:'v'.repeat(181)}))).status,400);
  assert.equal((await gateway(post({...valid,key:'other/workspace'}))).status,400);
});

test('authenticated update routes only basic public content, with revision checking and privacy safe response',async()=>{
  const original=globalThis.fetch;let forwarded=null;
  try{
    globalThis.fetch=async(input,options)=>{
      forwarded={url:String(input),...options,body:JSON.parse(options.body)};
      return reply({ok:true,item:{...valid,revision:1}});
    };
    const result=await gateway(post(valid));
    assert.equal(result.status,200);
    assert.equal((await result.json()).item.revision,1);
    assert.equal(forwarded.url,'https://example.supabase.co/rest/v1/rpc/mission_activity_page_update');
    assert.equal(forwarded.headers.apikey,'publishable_test_only');
    assert.equal(forwarded.headers.authorization,'Bearer valid-jwt');
    assert.deepEqual(Object.keys(forwarded.body).sort(),[
      'p_activity_key','p_event_date','p_event_time','p_expected_revision',
      'p_summary','p_title','p_venue','p_workspace_slug'
    ].sort());
    assert.equal(forwarded.body.p_workspace_slug,'ekodimission');
    assert.equal(forwarded.body.p_event_time,'17:00');
  }finally{globalThis.fetch=original}
});

test('server never reports success for stale edit, missing migration or upstream failure',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>reply({code:'40001',message:'ACTIVITY_EDIT_CONFLICT'},409);
    assert.equal((await gateway(post(valid))).status,409);
    globalThis.fetch=async()=>reply({code:'PGRST202',message:'Could not find the function'},404);
    assert.equal((await gateway(post(valid))).status,503);
    globalThis.fetch=async()=>reply({code:'42501',message:'ACTIVITY_EDIT_FORBIDDEN'},403);
    assert.equal((await gateway(post(valid))).status,403);
    globalThis.fetch=async()=>reply({ok:false},200);
    assert.equal((await gateway(post(valid))).status,503);
  }finally{globalThis.fetch=original}
});

test('public Mission site routes editorial GET and POST with no token disclosure',async()=>{
  const mock={...env(),ASSETS:{fetch:async()=>reply({})}};
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async(input,options)=>{
      const url=String(input);
      if(url.endsWith('mission_activity_page_public_snapshot'))return reply({ok:true,items:[]});
      return reply({ok:true,item:{key:valid.key,title:valid.title}});
    };
    const get=await spaceWorker.fetch(new Request('https://ekodi.kr'+MISSION_ACTIVITY_EDITOR_PATH),mock);
    assert.equal(get.status,200);
    assert.equal(get.headers.get('cache-control'),'no-store');
    const changed=await spaceWorker.fetch(post(valid),mock);
    assert.equal(changed.status,200);
    const guest=await spaceWorker.fetch(post(valid,''),mock);
    assert.equal(guest.status,401);
  }finally{globalThis.fetch=original}
});

test('every static public activity row has a stable key; edits require tenant operator and audit',async()=>{
  const page=await read('space/ekodimission-activities.page');
  const articles=[...page.matchAll(/<article\b[^>]*\bdata-activity-item\b[^>]*>/g)];
  assert.ok(articles.length>=15);
  for(const item of articles)assert.match(item[0],/data-activity-key="[a-z0-9-]+"/);
  const migration=await read('supabase/migrations/20261103090000_mission_activity_inline_editor.sql');
  for(const guard of ['public.activity_is_workspace_operator(v_tenant_id)','auth.uid() is null','enable row level security',
    'ACTIVITY_EDIT_CONFLICT','mission_activity_page_edit_audit','revoke all on function public.mission_activity_page_update']){
    assert.ok(migration.includes(guard),guard);
  }
  assert.doesNotMatch(migration,/grant\s+(?:select|insert|update|delete|all)\s+on\s+table\s+public\.mission_activity_page_edits\s+to\s+anon/i);
  const shell=await read('space/ekodimission-shell.js');
  assert.match(shell,/assets\/activity-editor\.js/);
  const ui=await read('space/ekodimission-activity-editor.js');
  assert.match(ui,/permissions\?\.activities!==true/);
  assert.match(ui,/authorizedToken/);
  assert.match(ui,/expectedRevision/);
  assert.match(ui,/window\.addEventListener\('ekodi:auth-logout',clearEditors\)/);
  assert.match(ui,/cache:'no-store'/);
});
