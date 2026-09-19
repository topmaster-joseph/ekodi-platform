import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRealtimeControl } from '../realtime-control.js';

async function sha256(value){
  const bytes=new TextEncoder().encode(String(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function room(){
  return {id:'room_live',tenant_id:'ekodi-biz',owner_user_id:'owner',mode:'public_broadcast',security_profile:'standard',title:'Live',status:'live',ai_enabled:1,recording_enabled:1,recording_notice_enabled:1,anonymous_viewers_enabled:1,created_at:'2026-09-19T00:00:00.000Z',updated_at:'2026-09-19T00:00:01.000Z',ended_at:null};
}
function fakeDb({publisherUpdatedAt=new Date().toISOString(),role='owner',accessHash=''}={}){
  const state={room:room(),session:{id:'ms_1',room_id:'room_live',tenant_id:'ekodi-biz',actor_key:'owner',role,provider:'cloudflare-realtime',provider_session_id:'provider_1',access_hash:accessHash,status:'active',created_at:publisherUpdatedAt,updated_at:publisherUpdatedAt},tracks:[{status:'active'}],recordings:[{status:'recording'}],destinations:[{status:'live'}],memberLeftAt:null};
  return {state,prepare(sql){return {bind(...args){return {
    first:async()=>{
      if(sql.includes("FROM realtime_rooms WHERE tenant_id IN")&&sql.includes("status='live'"))return state.room.status==='live'?state.room:null;
      if(sql.includes("SELECT id FROM realtime_media_sessions")&&sql.includes("updated_at>=?")){
        const cutoff=args.at(-1);return state.session.status==='active'&&['owner','cohost','presenter'].includes(state.session.role)&&state.session.updated_at>=cutoff?{id:state.session.id}:null;
      }
      if(sql.includes('SELECT * FROM realtime_rooms WHERE id=?'))return args[0]===state.room.id?state.room:null;
      if(sql.includes("SELECT * FROM realtime_media_sessions WHERE room_id=? AND id=? AND status='active'"))return args[0]===state.room.id&&args[1]===state.session.id&&state.session.status==='active'?state.session:null;
      return null;
    },
    run:async()=>{
      if(sql.startsWith("UPDATE realtime_rooms SET status='ended'")){
        const cutoff=args.at(-1);
        const fresh=state.session.status==='active'&&['owner','cohost','presenter'].includes(state.session.role)&&state.session.updated_at>=cutoff;
        if(state.room.status==='live'&&!fresh){state.room.status='ended';state.room.ended_at=args[0];state.room.updated_at=args[1];}
      } else if(sql.startsWith("UPDATE realtime_media_sessions SET status='closed'")) state.session.status='closed';
      else if(sql.startsWith("UPDATE realtime_media_tracks SET status='closed'")) state.tracks.forEach(x=>x.status='closed');
      else if(sql.startsWith("UPDATE realtime_destinations SET status='stopped'")) state.destinations.forEach(x=>x.status='stopped');
      else if(sql.startsWith("UPDATE realtime_recordings SET status='failed'")) state.recordings.forEach(x=>x.status='failed');
      else if(sql.startsWith("UPDATE realtime_room_members SET left_at=")) state.memberLeftAt=args[0];
      else if(sql.startsWith("UPDATE realtime_media_sessions SET updated_at=")) state.session.updated_at=args[0];
      return {success:true};
    },
    all:async()=>({results:[]}),
  }}}}};
}

test('public live hides and reconciles a stale publisher room',async()=>{
  const db=fakeDb({publisherUpdatedAt:'2026-09-19T00:00:00.000Z'});
  const response=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/live?tenant=ekodi-biz'),{DB:db});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.live,false);
  assert.equal(data.room,null);
  assert.equal(db.state.room.status,'ended');
  assert.equal(db.state.session.status,'closed');
  assert.equal(db.state.tracks[0].status,'closed');
  assert.equal(db.state.recordings[0].status,'failed');
  assert.equal(db.state.destinations[0].status,'stopped');
  assert.ok(db.state.memberLeftAt);
});

test('public live keeps a fresh publisher room visible',async()=>{
  const db=fakeDb({publisherUpdatedAt:new Date().toISOString()});
  const response=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/live?tenant=ekodi-biz'),{DB:db});
  const data=await response.json();
  assert.equal(data.live,true);
  assert.equal(data.room.id,'room_live');
  assert.equal(db.state.room.status,'live');
});

test('publisher heartbeat refreshes liveness with the existing session key',async()=>{
  const key='publisher-session-key';
  const db=fakeDb({publisherUpdatedAt:'2026-09-19T00:00:00.000Z',accessHash:await sha256(key)});
  const before=db.state.session.updated_at;
  const request=new Request('https://ekodi.kr/api/realtime/rooms/room_live/sessions/ms_1/heartbeat',{method:'POST',headers:{'content-type':'application/json','x-ekodi-session-key':key},body:'{}'});
  const response=await handleRealtimeControl(request,{DB:db});
  assert.equal(response.status,200);
  assert.equal((await response.json()).ok,true);
  assert.notEqual(db.state.session.updated_at,before);
});

test('viewer sessions cannot keep a broadcast alive',async()=>{
  const key='viewer-session-key';
  const db=fakeDb({publisherUpdatedAt:new Date().toISOString(),role:'viewer',accessHash:await sha256(key)});
  const request=new Request('https://ekodi.kr/api/realtime/rooms/room_live/sessions/ms_1/heartbeat',{method:'POST',headers:{'content-type':'application/json','x-ekodi-session-key':key},body:'{}'});
  const response=await handleRealtimeControl(request,{DB:db});
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,'publisher_heartbeat_forbidden');
});
