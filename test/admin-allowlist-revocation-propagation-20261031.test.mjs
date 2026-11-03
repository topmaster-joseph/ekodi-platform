import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

// Divergence D3 (2026-10-31): disabling/removing a Google allowlist super_admin left
// admins.role='super_admin', and email-only checks on tenant/site admin pages kept
// granting platform scope. Platform scope now needs an active allowlist row too.

function sqlFrom(src,re){const m=src.match(re);assert.ok(m,'query missing: '+re);return m[1];}

function seed(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE admins(id INTEGER PRIMARY KEY, email TEXT UNIQUE, role TEXT NOT NULL DEFAULT 'super_admin', created_at TEXT);
           CREATE TABLE admin_google_accounts(id INTEGER PRIMARY KEY, email TEXT UNIQUE, role TEXT, status TEXT);`);
  const a=db.prepare('INSERT INTO admins(email,role,created_at) VALUES(?,?,?)');
  const g=db.prepare('INSERT INTO admin_google_accounts(email,role,status) VALUES(?,?,?)');
  a.run('owner@example.test','super_admin','1'); g.run('Owner@Example.test ','super_admin','active');
  a.run('disabled@example.test','super_admin','2'); g.run('disabled@example.test','super_admin','disabled');
  a.run('removed@example.test','super_admin','3'); // allowlist row deleted
  a.run('legacy@example.test','super_admin','4');  // legacy password admin, never on allowlist
  a.run('operator@example.test','super_admin','5'); g.run('operator@example.test','operator','active');
  return db;
}
const allowed=(db,sql,email)=>Boolean(db.prepare(sql).get(email));

test('tenant authority grants platform scope only to an active allowlist super_admin',async()=>{
  const sql=sqlFrom(await read('tenant-access-authority.js'),/const row=await env\.DB\.prepare\("([^"]+)"\)/);
  const db=seed();
  assert.equal(allowed(db,sql,'owner@example.test'),true);
  for(const e of ['disabled@example.test','removed@example.test','legacy@example.test','operator@example.test','nobody@example.test'])
    assert.equal(allowed(db,sql,e),false,e);
});

test('seonammedi uses the same allowlist-backed check everywhere, including the roster',async()=>{
  const src=await read('seonammedi-admin-control.js');
  const sql=sqlFrom(src,/const PLATFORM_SUPER_ADMIN_SQL="([^"]+)"/);
  assert.doesNotMatch(src,/FROM admins WHERE lower\(trim\(email\)\)=\? AND role='super_admin'/);
  assert.equal((src.match(/prepare\(PLATFORM_SUPER_ADMIN_SQL\)/g)||[]).length,4);
  const db=seed();
  assert.equal(allowed(db,sql,'owner@example.test'),true);
  for(const e of ['disabled@example.test','removed@example.test','legacy@example.test','operator@example.test'])
    assert.equal(allowed(db,sql,e),false,e);
  const roster=sqlFrom(src,/const platform=await env\.DB\.prepare\("([^"]+)"\)\.all\(\)/);
  assert.deepEqual(db.prepare(roster).all().map(r=>r.email),['owner@example.test']);
});

test('disabling or removing an allowlist admin also demotes the legacy admins role',async()=>{
  const src=await read('admin-google-auth.js');
  assert.match(src,/UPDATE admins SET role = \? WHERE id = \?'\)\.bind\(status === 'active' \? role : 'viewer', linkedAdmin\.id\)/);
  const remove=src.slice(src.indexOf('async function removeAccount'),src.indexOf('async function',src.indexOf('async function removeAccount')+10));
  assert.match(remove,/UPDATE admins SET role = 'viewer' WHERE id = \?/);
  // Protected recovery owners still cannot be disabled or removed (unchanged).
  assert.match(src,/PROTECTED_SUPER_ADMIN/);
});
