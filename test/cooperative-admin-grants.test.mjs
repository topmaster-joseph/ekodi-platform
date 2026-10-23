import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,authFetch} from './helpers/cooperative-fixture.mjs';
import {COOPERATIVES} from '../cooperative-registry.js';
import {resolveCooperativeAccess} from '../cooperative-core-access.js';
import {assignments,auditSql,verifyAssignmentRows} from '../scripts/verify-cooperative-admin-grants.mjs';
const migration=fs.readFileSync(new URL('../migrations/0135_cooperative_chair_admins.sql',import.meta.url),'utf8');
function setup(){
  const f=fixture();
  f.sqlite.exec(`ALTER TABLE customer_access_grants ADD COLUMN created_at TEXT;
    ALTER TABLE customer_access_grants ADD COLUMN created_by INTEGER;
    ALTER TABLE customer_access_grants ADD COLUMN last_verified_at TEXT;
    ALTER TABLE customer_access_grants ADD COLUMN principal_type TEXT NOT NULL DEFAULT 'member';
    ALTER TABLE customer_access_grants ADD COLUMN github_username TEXT NOT NULL DEFAULT '';
    ALTER TABLE customer_access_grants ADD COLUMN note TEXT NOT NULL DEFAULT '';
    ALTER TABLE customer_access_grants ADD COLUMN updated_at TEXT;
    ALTER TABLE customer_access_grants ADD COLUMN updated_by INTEGER;
    CREATE TABLE customer_audit_logs(id INTEGER PRIMARY KEY,tenant_id INTEGER,user_id INTEGER,action TEXT,resource TEXT,detail TEXT,created_at TEXT);
    CREATE TABLE d1_migrations(name TEXT); INSERT INTO d1_migrations VALUES('0135_cooperative_chair_admins.sql');`);
  return f;
}
function apply(f){f.sqlite.exec('BEGIN');try{f.sqlite.exec(migration);f.sqlite.exec('COMMIT')}catch(e){f.sqlite.exec('ROLLBACK');throw e}}
const projects=f=>f.sqlite.prepare('SELECT * FROM cooperative_projects ORDER BY workspace_id').all();

test('requested chairs get only their own cooperative admin and founder links; private source, no real login',async()=>{
  const f=setup();
  f.sqlite.exec(`INSERT INTO admins VALUES(1,'topmaster.joseph@gmail.com','super_admin');`);
  const before=projects(f),admins=f.sqlite.prepare('SELECT * FROM admins').all();
  apply(f);
  for(const p of before){
    const a=assignments.find(a=>a.workspaceId===p.workspace_id),after=projects(f).find(r=>r.workspace_id===p.workspace_id);
    const expected=JSON.parse(p.snapshot_json);expected.founders[0].accountEmail=a.email;
    assert.deepEqual(JSON.parse(after.snapshot_json),expected);assert.equal(after.revision,p.revision+1);
  }
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM customer_access_grants').get().n,2);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM admins').all(),admins);
  const evidence=verifyAssignmentRows(f.sqlite.prepare(auditSql).all());
  assert.equal(evidence.googleLoginVerified,false);assert.equal(evidence.authenticatedProductionWritesVerified,false);
  assert.ok(evidence.checked.every(c=>!c.crossCooperativeAdminGranted&&!c.tenantAccessManagementGranted));
  const originalFetch=globalThis.fetch;globalThis.fetch=authFetch(Object.fromEntries(assignments.map((a,i)=>['fixture-'+i,a.email])));
  try{for(const [i,a] of assignments.entries())for(const coop of COOPERATIVES){
    const r=await resolveCooperativeAccess(new Request('https://ekodi.kr/'+coop.publicSlug+'/api/project',{headers:{authorization:'Bearer fixture-'+i}}),f.env,coop,{administrative:true});
    assert.equal(r.allowed,coop.workspaceId===a.workspaceId);if(r.allowed)assert.equal(r.scope,'tenant');
  }}finally{globalThis.fetch=originalFetch;f.sqlite.close()}
});

test('migration is idempotent, keeps unrelated grants and retains previous link audit for reversal',()=>{
  const f=setup();f.grant(COOPERATIVES[0],'other@example.test','owner');apply(f);
  const before=projects(f),grants=f.sqlite.prepare('SELECT * FROM customer_access_grants').all();apply(f);
  assert.deepEqual(projects(f),before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM customer_access_grants').all(),grants);
  const logs=f.sqlite.prepare('SELECT detail FROM customer_audit_logs').all();assert.equal(logs.length,2);
  assert.ok(logs.every(l=>JSON.parse(l.detail).grantCreated===1&&JSON.parse(l.detail).previousAccountEmail===null));
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM cooperative_audit').get().n,2);f.sqlite.close();
});

for(const conflict of ['linked-email','renamed-founder','inactive-tenant','disabled','expired','invalid-expiry','explicit-deny','case-alias','external','insufficient-role']){
  test(`conflicting ${conflict} aborts BOTH assignments atomically without overriding restrictions`,()=>{
    const f=setup(),a=assignments[1],coop=COOPERATIVES.find(c=>c.workspaceId===a.workspaceId);
    if(conflict==='linked-email')f.sqlite.prepare("UPDATE cooperative_projects SET snapshot_json=json_set(snapshot_json,'$.founders[0].accountEmail','different@example.test') WHERE workspace_id=?").run(a.workspaceId);
    else if(conflict==='renamed-founder')f.sqlite.prepare("UPDATE cooperative_projects SET snapshot_json=json_set(snapshot_json,'$.founders[0].representative','다른 사람') WHERE workspace_id=?").run(a.workspaceId);
    else if(conflict==='inactive-tenant')f.sqlite.prepare("UPDATE customer_tenants SET status='disabled' WHERE slug=?").run(a.slug);
    else f.grant(coop,conflict==='case-alias'?a.email.toUpperCase():a.email,conflict==='external'?'external_developer':conflict==='insufficient-role'?'member':'admin',{
      enabled:conflict==='disabled'?0:1,expiresAt:conflict==='expired'?'2020-01-01':conflict==='invalid-expiry'?'bad-date':null,
      denied:conflict==='explicit-deny'?['tenant.site.manage']:[],
    });
    const before=projects(f),grants=f.sqlite.prepare('SELECT * FROM customer_access_grants').all();
    assert.throws(()=>apply(f));assert.deepEqual(projects(f),before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM customer_access_grants').all(),grants);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM customer_audit_logs').get().n,0);f.sqlite.close();
  });
}

test('existing allowed grant is preserved byte for byte, including role, expiry, denials and notes',()=>{
  const f=setup(),a=assignments[0];f.grant(COOPERATIVES[0],a.email,'owner',{expiresAt:'2099-01-01',denied:['tenant.access.manage']});
  f.sqlite.prepare("UPDATE customer_access_grants SET note='existing restriction',last_verified_at='2026-01-01' WHERE email=?").run(a.email);
  const before=f.sqlite.prepare('SELECT * FROM customer_access_grants WHERE email=?').get(a.email);apply(f);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM customer_access_grants WHERE email=?').get(a.email),before);
  const log=f.sqlite.prepare('SELECT detail FROM customer_audit_logs WHERE tenant_id=?').get(before.tenant_id);
  assert.equal(JSON.parse(log.detail).grantCreated,0);
  const rows=f.sqlite.prepare(auditSql).all();assert.equal(verifyAssignmentRows(rows).checked.length,2);
  for(const mutate of [r=>r.account_email='other@example.test',r=>r.enabled=0,r=>r.assignment_audit_count=0,r=>r.migration_applied=0,r=>r.representative='다른 사람']){
    const changed=structuredClone(rows);mutate(changed[0]);assert.throws(()=>verifyAssignmentRows(changed));
  }f.sqlite.close();
});
