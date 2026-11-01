import test from 'node:test';
import assert from 'node:assert/strict';
import {createEkodiActivityTracker} from '../points-active-client.js';
function fixture(){
  const events=new Map();let now=100000,visible=true,focused=true;
  const calls=[];let onAuth=null,listener;
  const doc={
    get visibilityState(){return visible?'visible':'hidden';},
    hasFocus(){return focused;},
    addEventListener(type,fn){events.set(type,fn);},
    removeEventListener(type){events.delete(type);}
  };
  const uuid='d5b768ab-99ad-4bfc-bc11-111111111111';
  const sb={
    auth:{
      getSession:async()=>({data:{session:{access_token:'fake-user-token'}}}),
      onAuthStateChange(fn){onAuth=fn;return {data:{subscription:{unsubscribe(){onAuth=null;}}}};}
    },
    rpc:async(name,payload)=>{calls.push({name,payload});return {data:{session_id:uuid,awarded:false},error:null};}
  };
  const tracker=createEkodiActivityTracker({supabase:sb,siteId:'ekodichurch',enabled:true,
    documentRef:doc,clock:()=>now,schedule:fn=>{listener=fn;return 1;},cancel:()=>{}});
  return {tracker,events,calls,uuid,interact:()=>events.get('pointerdown')?.(),setTime:t=>{now=t;},
    hide:()=>{visible=false;},show:()=>{visible=true;},logout:()=>onAuth?.('SIGNED_OUT'),timer:()=>listener?.()};
}
test('disabled tracker does not initialize subscriptions or network',async()=>{
  let count=0;
  const sb={auth:{getSession:async()=>{count++;}},rpc:async()=>{count++;}};
  const t=createEkodiActivityTracker({supabase:sb,siteId:'ekodichurch',enabled:false});
  assert.equal(t.start(),false);await t.tick();assert.equal(count,0);
});
test('site-owned heartbeat passes no user id, points, elapsed seconds or event keys',async()=>{
  const f=fixture();assert.equal(f.tracker.start(),true);
  await f.tracker.tick();assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].name,'ekodi_points_active_heartbeat');
  assert.deepEqual(Object.keys(f.calls[0].payload).sort(),
    ['p_site','p_session','p_foreground','p_recent_interaction'].sort());
  f.interact();f.setTime(120000);await f.tracker.tick();
  assert.equal(f.calls[1].payload.p_session,f.uuid);
  assert.equal(f.calls[1].payload.p_foreground,true);
  assert.equal(f.calls[1].payload.p_recent_interaction,true);
  f.hide();f.setTime(140000);await f.tracker.tick();
  assert.equal(f.calls.at(-1).payload.p_foreground,false);
  assert.equal(f.calls.at(-1).payload.p_recent_interaction,false);
  f.logout();assert.equal(f.tracker.running,false);
  const prior=f.calls.length;await f.tracker.tick();assert.equal(f.calls.length,prior);
});
test('no tracker for invalid site IDs, and repeated start is idempotent',()=>{
  const f=fixture();
  const t=createEkodiActivityTracker({supabase:{auth:{getSession(){}},rpc(){}},
    siteId:'../../admin',enabled:true,documentRef:{addEventListener(){}}});
  assert.equal(t.start(),false);
  assert.equal(f.tracker.start(),true);
  assert.equal(f.tracker.start(),false);
  f.tracker.stop();
});
