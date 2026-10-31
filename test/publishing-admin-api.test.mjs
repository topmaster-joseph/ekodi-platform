import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handlePublishingWorkflow, prepareScheduledPublishing } from '../publishing-workflow-api.js';
import { evaluateReleaseReadiness } from '../publishing/human/editorial-policy.js';

function memory(){
  const db=new DatabaseSync(':memory:');
  const schema=readFileSync(new URL('../migrations/202610291000_publishing_workflow.sql',import.meta.url),'utf8');
  db.exec(schema);
  function statement(sql,params=[]){
    return {
      bind(...values){return statement(sql,values)},
      async first(){return db.prepare(sql).get(...params)||null},
      async all(){return {results:db.prepare(sql).all(...params)}},
      async run(){const out=db.prepare(sql).run(...params);return {meta:{changes:out.changes}}}
    };
  }
  return {sql:db,api:{
    prepare(sql){return statement(sql)},
    async batch(queries){
      db.exec('BEGIN');
      try {const r=[];for(const query of queries)r.push(await query.run());db.exec('COMMIT');return r}
      catch(e){db.exec('ROLLBACK');throw e}
    }
  }};
}
function request(path,{method='GET',actor='authorA',body}={}){
  return new Request('https://ekodi.kr/publishing/api/workflow/'+path,{
    method,headers:{authorization:'Bearer '+actor.padEnd(36,'x'),'content-type':'application/json'},
    body:body?JSON.stringify(body):undefined
  });
}
const originalFetch=globalThis.fetch;
test.before(()=>{
  globalThis.fetch=async(_,opts)=>{
    const value=String(opts?.headers?.authorization||'');
    const id=/Bearer (.{36})/.exec(value)?.[1]?.replace(/x+$/,'')||'anonymous';
    return new Response(JSON.stringify({id,email:id+'@example.com',email_confirmed_at:'2026-10-29T00:00:00Z'}));
  };
});
test.after(()=>{globalThis.fetch=originalFetch});

// PUBLISHING-ADMIN-001 (§12): admin endpoints are read-only and gated by the publisher ledger role.
const env=db=>({PUBLISH_DB:db.api});
test('authors cannot read publishing admin data; staff see summary and audit; only admins list roles',async()=>{
  const db=memory();
  db.sql.prepare("INSERT INTO publishing_workflow_roles (user_id,role,granted_by,granted_at) VALUES (?,?,?,?)").run('editorE','editor','seed','2026-10-31');
  db.sql.prepare("INSERT INTO publishing_workflow_roles (user_id,role,granted_by,granted_at) VALUES (?,?,?,?)").run('adminZ','admin','seed','2026-10-31');
  const created=await handlePublishingWorkflow(request('projects',{method:'POST',actor:'authorA',body:{title:'시험 원고',fieldId:'theology'}}),env(db));
  assert.ok([201,400].includes(created.status));
  for(const p of ['admin/summary','admin/audit','admin/roles']){
    const r=await handlePublishingWorkflow(request(p,{actor:'authorA'}),env(db));
    assert.equal(r.status,403,p+' must be staff-only');
  }
  const s=await handlePublishingWorkflow(request('admin/summary',{actor:'editorE'}),env(db));
  assert.equal(s.status,200);
  const data=await s.json();
  assert.equal(data.role,'editor');assert.equal(data.saleActivationEnabled,false);
  assert.ok(!JSON.stringify(data).includes('@example.com'),'no emails in admin summary');
  assert.equal((await handlePublishingWorkflow(request('admin/audit',{actor:'editorE'}),env(db))).status,200);
  assert.equal((await handlePublishingWorkflow(request('admin/roles',{actor:'editorE'}),env(db))).status,403);
  const roles=await (await handlePublishingWorkflow(request('admin/roles',{actor:'adminZ'}),env(db))).json();
  assert.ok(roles.roles.every(x=>!/editorE|adminZ/.test(x.user)),'role holders are masked');
  assert.equal((await handlePublishingWorkflow(request('admin/summary',{method:'POST',actor:'adminZ'}),env(db))).status,404,'no admin writes');
});
