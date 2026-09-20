import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRealtimeControl } from '../realtime-control.js';

function staleRoom(){
  return {
    id:'room_stale',
    tenant_id:'ekodi-lab',
    owner_user_id:'owner',
    mode:'education',
    security_profile:'standard',
    title:'EKODI Lab LIVE',
    status:'live',
    ai_enabled:1,
    recording_enabled:1,
    recording_notice_enabled:1,
    anonymous_viewers_enabled:1,
    created_at:'2026-09-19T00:00:00.000Z',
    updated_at:'2026-09-19T00:01:00.000Z',
    ended_at:null,
  };
}

function fakeDb({providerSessionId='provider-stale'}={}){
  const room=staleRoom();
  const mutations=[];
  return {
    room,mutations,
    prepare(sql){
      return {
        bind(...args){
          return {
            first:async()=>{
              if(sql.includes('FROM realtime_rooms WHERE tenant_id IN'))return room.status==='live'?{...room}:null;
              if(sql.includes('SELECT * FROM realtime_rooms WHERE id=?'))return args[0]===room.id?{...room}:null;
              return null;
            },
            all:async()=>{
              if(sql.includes('FROM realtime_media_sessions WHERE room_id=?'))return {results:[{id:'ms_owner',provider_session_id:providerSessionId}]};
              return {results:[]};
            },
            run:async()=>{
              mutations.push({sql,args});
              if(sql.includes("UPDATE realtime_rooms SET status='ended'")){
                room.status='ended';
                room.updated_at=args[0];
                room.ended_at=args[1];
              }
              return {success:true};
            },
          };
        },
      };
    },
  };
}

async function withFetch(handler,fn){
  const previous=globalThis.fetch;
  globalThis.fetch=handler;
  try{return await fn();}finally{globalThis.fetch=previous;}
}

test('stale live room is ended when SFU publisher has no active local track',async()=>{
  const db=fakeDb();
  await withFetch(async()=>new Response(JSON.stringify({tracks:[
    {location:'local',trackName:'camera',status:'inactive'},
    {location:'remote',trackName:'viewer',status:'active'},
  ]}),{status:200,headers:{'content-type':'application/json'}}),async()=>{
    const response=await handleRealtimeControl(
      new Request('https://ekodi.kr/api/realtime/live?tenant=ekodi-lab'),
      {DB:db,REALTIME_SFU_APP_ID:'app',REALTIME_SFU_APP_SECRET:'secret'}
    );
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.live,false);
    assert.equal(data.room,null);
    assert.equal(db.room.status,'ended');
    assert.ok(db.mutations.some(item=>item.sql.includes("UPDATE realtime_rooms SET status='ended'")));
    assert.ok(db.mutations.some(item=>item.sql.includes("UPDATE realtime_media_sessions SET status='closed'")));
    assert.ok(db.mutations.some(item=>item.sql.includes("UPDATE realtime_media_tracks SET status='closed'")));
  });
});

test('stale-looking live room is preserved when SFU publisher still has an active local track',async()=>{
  const db=fakeDb();
  await withFetch(async()=>new Response(JSON.stringify({tracks:[
    {location:'local',trackName:'camera',status:'active'},
  ]}),{status:200,headers:{'content-type':'application/json'}}),async()=>{
    const response=await handleRealtimeControl(
      new Request('https://ekodi.kr/api/realtime/live?tenant=ekodi-lab'),
      {DB:db,REALTIME_SFU_APP_ID:'app',REALTIME_SFU_APP_SECRET:'secret'}
    );
    const data=await response.json();
    assert.equal(data.live,true);
    assert.equal(data.room.id,'room_stale');
    assert.equal(db.room.status,'live');
    assert.equal(db.mutations.length,0);
  });
});

test('provider uncertainty preserves live state instead of ending a room',async()=>{
  const db=fakeDb();
  await withFetch(async()=>new Response(JSON.stringify({errorCode:'provider_unavailable'}),{status:503,headers:{'content-type':'application/json'}}),async()=>{
    const response=await handleRealtimeControl(
      new Request('https://ekodi.kr/api/realtime/live?tenant=ekodi-lab'),
      {DB:db,REALTIME_SFU_APP_ID:'app',REALTIME_SFU_APP_SECRET:'secret'}
    );
    const data=await response.json();
    assert.equal(data.live,true);
    assert.equal(db.room.status,'live');
    assert.equal(db.mutations.length,0);
  });
});

test('provider 404 is definitive stale evidence and ends the room',async()=>{
  const db=fakeDb();
  await withFetch(async()=>new Response(JSON.stringify({errorCode:'session_not_found'}),{status:404,headers:{'content-type':'application/json'}}),async()=>{
    const response=await handleRealtimeControl(
      new Request('https://ekodi.kr/api/realtime/live?tenant=ekodi-lab'),
      {DB:db,REALTIME_SFU_APP_ID:'app',REALTIME_SFU_APP_SECRET:'secret'}
    );
    const data=await response.json();
    assert.equal(data.live,false);
    assert.equal(db.room.status,'ended');
  });
});
