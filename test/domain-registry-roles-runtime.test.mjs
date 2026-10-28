import test from 'node:test';
import assert from 'node:assert/strict';
import auth from '../auth-worker-core.js';

// Isolated D1-shaped fake. There are no production credentials, DNS calls or writes.
function sandbox(role) {
  const audit={read:0,update:0,audit:0};
  const db={
    batch:async()=>[],
    prepare(query) {
      const sql=String(query);
      const stmt={
        bind(){return stmt},
        async run(){
          if(sql.includes('UPDATE domain_registry'))audit.update++;
          if(sql.includes('INSERT INTO audit_logs'))audit.audit++;
          return {success:true,meta:{last_row_id:1}};
        },
        async all(){
          if(sql.includes('PRAGMA table_info(admins)'))return {results:[{name:'password_iterations'}]};
          if(sql.includes('SELECT * FROM domain_registry')) {
            audit.read++;
            return {results:[{domain:'ekodi.kr',registrar:'synthetic',registered_at:null,expires_at:null,auto_renew:0,transfer_lock:1,whois_privacy:1,reminder_days:60,memo:'',updated_at:''}]};
          }
          return {results:[]};
        },
        async first(){
          if(sql.includes('FROM sessions JOIN admins'))return role?{id:1,email:'fixture@local.invalid',role,expires_at:'2099-01-01T00:00:00Z'}:null;
          return null;
        },
      };
      return stmt;
    },
  };
  return {db,audit};
}
async function invoke(role,method='GET') {
  const {db,audit}=sandbox(role);
  const url='https://ekodi.kr/api/registry'+(method==='PUT'?'/ekodi.kr':'');
  const headers={'content-type':'application/json'};
  if(role)headers.authorization='Bearer synthetic-test-token-only';
  const request=new Request(url,{method,headers,...(method==='PUT'?{body:JSON.stringify({registeredAt:'',expiresAt:'',autoRenew:false,transferLock:true,whoisPrivacy:true,reminderDays:60,memo:'synthetic'})}:{})});
  const response=await auth.fetch(request,{DB:db,ENVIRONMENT:'test'});
  return {status:response.status,payload:await response.json(),audit};
}
test('domain registry rejects unauthenticated GET and PUT with 401',async()=>{
  for(const method of ['GET','PUT']){
    const r=await invoke(null,method);
    assert.equal(r.status,401);
    assert.deepEqual(r.audit,{read:0,update:0,audit:0});
  }
});
test('domain registry denies site_admin and member GET and PUT before any registry access',async()=>{
  for(const role of ['site_admin','member'])for(const method of ['GET','PUT']){
    const r=await invoke(role,method);
    assert.equal(r.status,403,`${role} ${method}`);
    assert.deepEqual(r.audit,{read:0,update:0,audit:0});
  }
});
test('super_admin may read and update synthetic registry with audit',async()=>{
  const listed=await invoke('super_admin','GET');
  assert.equal(listed.status,200);
  assert.equal(listed.payload.records?.length,1);
  assert.equal(listed.audit.read,1);
  const updated=await invoke('super_admin','PUT');
  assert.equal(updated.status,200);
  assert.equal(updated.payload.ok,true);
  assert.equal(updated.audit.update,1);
  assert.equal(updated.audit.audit,1);
});
