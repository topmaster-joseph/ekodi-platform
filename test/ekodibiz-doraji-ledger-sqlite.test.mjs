import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('Doraji draft ledger migration applies to isolated SQLite and enforces draft-only constraints',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON;CREATE TABLE admins(id INTEGER PRIMARY KEY,email TEXT NOT NULL)');
  db.prepare('INSERT INTO admins(id,email) VALUES (?,?)').run(1,'fixture@example.invalid');
  db.exec(fs.readFileSync(new URL('../schemas/ekodibiz/doraji-draft-ledger.sql',import.meta.url),'utf8'));
  const id='11111111-1111-4111-8111-111111111111';
  const stamp='2026-10-15T00:00:00.000Z';
  db.prepare("INSERT INTO doraji_projects(id,owner_admin_id,name,region,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(id,1,'테스트 하우스','전남',stamp,stamp);
  assert.equal(db.prepare('SELECT status FROM doraji_projects WHERE id=?').get(id).status,'draft');
  assert.throws(()=>db.prepare("INSERT INTO doraji_records(id,project_id,kind,record_date,title,state,author_admin_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run('r1',id,'contract','2026-10-15','초안','signed',1,stamp,stamp),/constraint/i);
  db.prepare("INSERT INTO doraji_records(id,project_id,kind,record_date,title,author_admin_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run('r1',id,'contract','2026-10-15','검토용 초안',1,stamp,stamp);
  assert.throws(()=>db.prepare("UPDATE doraji_records SET state='approved' WHERE id='r1'").run(),/constraint/i);
  db.exec('BEGIN IMMEDIATE');
  const result=db.prepare('UPDATE doraji_records SET title=?,version=version+1 WHERE id=? AND version=?').run('수정된 초안','r1',1);
  db.prepare("INSERT INTO doraji_audit_events(id,project_id,actor_admin_id,action,resource_id,description,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1").run('event-1',id,1,'record_updated','r1','draft_ledger',stamp);
  db.exec('COMMIT');
  assert.equal(result.changes,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM doraji_audit_events').get().n,1);
  assert.equal(db.prepare('SELECT version FROM doraji_records WHERE id=?').get('r1').version,2);
 }finally{db.close()}
});
