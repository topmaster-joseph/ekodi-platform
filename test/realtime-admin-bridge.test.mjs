import test from 'node:test';
import assert from 'node:assert/strict';
import { currentIdentity, authorizationRole } from '../realtime-control.js';

function adminDb(role='super_admin'){
  return {prepare(sql){
    assert.match(sql,/FROM sessions JOIN admins/);
    return {bind(hash,now){
      assert.match(hash,/^[a-f0-9]{64}$/);assert.match(now,/Z$/);
      return {first:async()=>({email:'admin@example.test',role,expires_at:'2099-01-01T00:00:00.000Z'})};
    }};
  }};
}

test('Realtime accepts a valid central super-admin session when Supabase rejects the token',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:401});
  try{
    const request=new Request('https://ekodi.kr/api/realtime/rooms',{headers:{authorization:'Bearer central-admin-token'}});
    const identity=await currentIdentity(request,{DB:adminDb(),SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'});
    assert.equal(identity?.platformAdminRole,'super_admin');
    assert.equal(identity?.loginProvider,'ekodi-admin');
    assert.equal(authorizationRole(identity,'ekodichurch',{}),'owner');
  }finally{globalThis.fetch=original;}
});
