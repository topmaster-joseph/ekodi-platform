import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRealtimeControl, authorizationRole } from '../realtime-control.js';
import { realtimeTenantList, realtimeTenantFromPath } from '../realtime-tenant-registry.js';

function fakeDb(){
  const rooms=new Map();
  return {rooms,prepare(sql){
    return {bind(...args){
      return {
        first:async()=>{
          if(sql.includes('FROM sessions JOIN admins'))return {email:'admin@example.test',role:'super_admin',expires_at:'2099-01-01T00:00:00.000Z'};
          if(sql.includes("FROM service_subscriptions WHERE subject_type='person'"))return null;
          if(sql.includes('SELECT * FROM realtime_rooms WHERE id=?'))return rooms.get(args[0])||null;
          return null;
        },
        run:async()=>{
          if(sql.startsWith('INSERT INTO realtime_rooms'))rooms.set(args[0],{id:args[0],tenant_id:args[1],owner_user_id:args[2],mode:args[3],security_profile:args[4],title:args[5],status:'created',ai_enabled:args[6],recording_enabled:args[7],recording_notice_enabled:args[8],anonymous_viewers_enabled:args[9],created_at:args[10],updated_at:args[11]});
          return {success:true};
        },
        all:async()=>({results:[]}),
      };
    }};
  }};
}
test('Realtime tenant registry exposes canonical Live paths',()=>{
  const tenants=realtimeTenantList();
  assert.equal(tenants.length,11);
  for(const tenant of tenants){
    assert.equal(realtimeTenantFromPath(tenant.path)?.id,tenant.id);
    assert.match(tenant.path,/^\/.+\/live\/$/);
  }
});

test('central super-admin creates rooms with tenant-specific mode and Studio URL',async()=>{
  for(const tenant of realtimeTenantList()){
    const db=fakeDb();
    const request=new Request('https://ekodi.kr/api/realtime/rooms',{method:'POST',headers:{authorization:'Bearer central-admin-token','content-type':'application/json'},body:JSON.stringify({tenant:tenant.apiTenant,recording:false,interactiveParticipants:1,durationMinutes:30})});
    const response=await handleRealtimeControl(request,{DB:db});
    assert.equal(response.status,201,tenant.id);
    const data=await response.json();
    assert.equal(data.room.tenantId,tenant.apiTenant,tenant.id);
    assert.equal(data.room.mode,tenant.mode,tenant.id);
    assert.equal(data.studioUrl,`https://ekodi.kr${tenant.path}?room=${encodeURIComponent(data.room.id)}&mode=studio`,tenant.id);
  }
});
test('unknown tenants are rejected before room creation',async()=>{
  const response=await handleRealtimeControl(new Request('https://ekodi.kr/api/realtime/rooms',{method:'POST',headers:{authorization:'Bearer central-admin-token','content-type':'application/json'},body:JSON.stringify({tenant:'not-a-real-tenant'})}),{DB:fakeDb()});
  assert.equal(response.status,400);
  assert.equal((await response.json()).error,'invalid_tenant');
});

test('tenant context aliases normalize existing operator roles',()=>{
  const identity={email:'operator@example.test',contexts:[{tenant:'biz',authorizationRole:'hq_manager'},{tenant:'pizzamaru',authorizationRole:'store_owner'}]};
  assert.equal(authorizationRole(identity,'ekodi-biz',{}),'manager');
  assert.equal(authorizationRole(identity,'pizzamaru',{}),'owner');
  assert.equal(authorizationRole(identity,'cgma',{}),'');
});
