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

// PUBLISHING-ROLES-001: 출판 관리자만 초대·회수하며, 권한은 인증된 같은 이메일로 로그인했을 때만 생긴다.
test('admin invites by email; the verified account claims it; self, last-admin and non-admin changes are refused',async()=>{
  const db=memory();
  db.sql.prepare("INSERT INTO publishing_workflow_roles (user_id,role,granted_by,granted_at) VALUES (?,?,?,?)").run('adminZ','admin','seed','2026-10-31');
  const post=(actor,body)=>handlePublishingWorkflow(request('admin/roles',{method:'POST',actor,body}),env(db));
  assert.equal((await post('authorA',{action:'invite',email:'editorN@example.com',role:'editor'})).status,403,'authors cannot invite');
  assert.equal((await post('adminZ',{action:'invite',email:'not-an-email',role:'editor'})).status,400);
  assert.equal((await post('adminZ',{action:'invite',email:'x@example.com',role:'owner'})).status,400,'unknown role refused');
  assert.equal((await post('adminZ',{action:'invite',email:'adminZ@example.com',role:'editor'})).status,409,'cannot change self');
  const inv=await post('adminZ',{action:'invite',email:'EditorN@Example.com',role:'editor'});
  assert.equal(inv.status,200);
  const listed=await inv.json();
  assert.equal(listed.invites.length,1);assert.ok(!JSON.stringify(listed).includes('editorN@example.com'),'invite email masked');
  // 다른 계정은 초대를 가져갈 수 없다.
  assert.equal((await handlePublishingWorkflow(request('admin/summary',{actor:'authorA'}),env(db))).status,403);
  // 초대받은 계정(인증된 같은 이메일)이 로그인하면 권한이 생긴다.
  assert.equal((await handlePublishingWorkflow(request('admin/summary',{actor:'editorN'}),env(db))).status,200);
  assert.equal(db.sql.prepare("SELECT role FROM publishing_workflow_roles WHERE user_id='editorN'").get().role,'editor');
  assert.ok(db.sql.prepare("SELECT claimed_at FROM publishing_workflow_role_invites").get().claimed_at);
  const roles=await (await handlePublishingWorkflow(request('admin/roles',{actor:'adminZ'}),env(db))).json();
  assert.ok(roles.roles.every(x=>!/editorN|adminZ/.test(JSON.stringify(x))),'no raw ids in role list');
  const self=roles.roles.find(x=>x.role==='admin'),ed=roles.roles.find(x=>x.role==='editor');
  assert.equal((await post('adminZ',{action:'revoke',ref:self.ref})).status,409,'cannot revoke self / last admin');
  assert.equal((await post('editorN',{action:'revoke',ref:self.ref})).status,403,'editors cannot revoke');
  assert.equal((await post('adminZ',{action:'revoke',ref:ed.ref})).status,200);
  assert.equal((await handlePublishingWorkflow(request('admin/summary',{actor:'editorN'}),env(db))).status,403,'revoked; a claimed invite is not reused');
  const actions=db.sql.prepare("SELECT action FROM publishing_workflow_audit WHERE project_id='roles' ORDER BY created_at").all().map(x=>x.action);
  for(const a of ['role_invited','role_invite_claimed','role_revoked'])assert.ok(actions.includes(a),a+' audited');
});
