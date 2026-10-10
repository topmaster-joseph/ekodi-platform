import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleRealtimeControl} from '../realtime-control.js';

const migration=readFileSync(new URL('../migrations/0130_realtime_presentation_state.sql',import.meta.url),'utf8');
function fixtures(){
  const rooms=new Map([
    ['room_church',{id:'room_church',tenant_id:'ekodichurch',owner_user_id:'person:church',status:'live',anonymous_viewers_enabled:1}],
    ['room_mission',{id:'room_mission',tenant_id:'ekodimission',owner_user_id:'person:mission',status:'live',anonymous_viewers_enabled:1}],
    ['room_private',{id:'room_private',tenant_id:'ekodi-lab',owner_user_id:'person:lab',status:'live',anonymous_viewers_enabled:0}],
    ['room_ended',{id:'room_ended',tenant_id:'ekodichurch',owner_user_id:'person:church',status:'ended',anonymous_viewers_enabled:1}],
  ]);
  const presentation=new Map();
  const db={prepare(sql){return{bind(...params){return{
    async first(){
      if(sql.includes('FROM sessions JOIN admins'))return{email:'admin@example.test',role:'super_admin',expires_at:'2099-01-01T00:00:00.000Z'};
      if(sql.includes("FROM service_subscriptions WHERE subject_type='person'"))return null;
      if(sql.includes('SELECT * FROM realtime_rooms WHERE id=?'))return rooms.get(params[0])||null;
      if(sql.includes('FROM realtime_presentation_state WHERE room_id=?')){const item=presentation.get(params[0]);return item?.tenant_id===params[1]?item:null}
      return null;
    },
    async run(){
      if(sql.includes('INSERT INTO realtime_presentation_state')){
        const [room_id,tenant_id,deck_id,slide_index,updated_at]=params;
        const previous=presentation.get(room_id);
        if(previous&&previous.tenant_id!==tenant_id)return{success:false};
        presentation.set(room_id,{room_id,tenant_id,deck_id,slide_index,revision:(previous?.revision||0)+1,updated_at});
      }
      return{success:true};
    },
    async all(){return{results:[]};}
  }} }};
  return{db,rooms,presentation};
}
function req(room,method='GET',data,authorized=false){
  return new Request('https://ekodi.kr/api/realtime/rooms/'+room+'/presentation',{
    method,headers:{...(authorized?{authorization:'Bearer central-admin-token'}:{}),...(data?{'content-type':'application/json'}:{})},
    ...(data?{body:JSON.stringify(data)}:{})
  });
}
test('migration keeps one 0..119 bounded cursor scoped to a room and tenant',()=>{
  assert.match(migration,/room_id TEXT PRIMARY KEY/);
  assert.match(migration,/tenant_id TEXT NOT NULL/);
  assert.match(migration,/BETWEEN 0 AND 119/);
  assert.doesNotMatch(migration,/stream_key|secret|transcript/i);
});
test('anonymous public watcher can read room cursor, cannot write',async()=>{
  const {db}=fixtures();
  const initial=await handleRealtimeControl(req('room_church'),{DB:db});
  assert.equal(initial.status,200);
  assert.equal((await initial.json()).presentation,null);
  const write=await handleRealtimeControl(req('room_church','PUT',{deckId:'worship-2026-10-11',index:2}),{DB:db});
  assert.equal(write.status,403);
});
test('authorized host writes numbered slides only for room own tenant',async()=>{
  const {db,presentation}=fixtures();
  const first=await handleRealtimeControl(req('room_church','PUT',{deckId:'worship-2026-10-11',index:3},true),{DB:db});
  assert.equal(first.status,200);
  assert.equal((await first.json()).presentation.revision,1);
  const next=await handleRealtimeControl(req('room_church','PUT',{deckId:'worship-2026-10-11',index:14},true),{DB:db});
  assert.equal(next.status,200);
  const data=await next.json();
  assert.equal(data.presentation.index,14);
  assert.equal(data.presentation.revision,2);
  assert.equal(presentation.get('room_church').tenant_id,'ekodichurch');
  const mission=await handleRealtimeControl(req('room_mission'),{DB:db});
  assert.equal((await mission.json()).presentation,null);
});
test('validates index, deck, status, and private viewer policy',async()=>{
  const {db}=fixtures();
  const attempts=[
    ['room_church',{deckId:'worship-2026-10-11',index:120},400],
    ['room_church',{deckId:'worship-2026-10-11',index:-1},400],
    ['room_church',{deckId:'../church',index:4},400],
    ['room_church',{deckId:'worship-2026-10-11',index:'2'},400],
    ['room_ended',{deckId:'worship-2026-10-11',index:0},409],
  ];
  for(const [room,data,status] of attempts){
    const response=await handleRealtimeControl(req(room,'PUT',data,true),{DB:db});
    assert.equal(response.status,status);
  }
  const noAuth=await handleRealtimeControl(req('room_private'),{DB:db});
  assert.equal(noAuth.status,401);
  const auth=await handleRealtimeControl(req('room_private'),{DB:db});
  assert.equal((await auth.json()).error,'authentication_required');
});
