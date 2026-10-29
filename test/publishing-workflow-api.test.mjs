import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handlePublishingWorkflow } from '../publishing-workflow-api.js';

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
test('without independent publisher database, every mutable route fails closed',async()=>{
  const res=await handlePublishingWorkflow(request('projects',{method:'POST',body:{title:'새 도서',fieldId:'literature'}}),{});
  assert.equal(res.status,503);
  const health=await handlePublishingWorkflow(new Request('https://ekodi.kr/publishing/api/workflow/health'),{});
  assert.equal((await health.json()).dbConfigured,false);
});
test('server enforces author ownership and editorial role grants',async()=>{
  const {sql,api}=memory(),env={PUBLISH_DB:api};
  const created=await handlePublishingWorkflow(request('projects',{method:'POST',body:{
    title:'독립 원고',fieldId:'literature'
  }}),env);
  assert.equal(created.status,201);
  const {project:p}=await created.json();
  assert.equal(p.stage,'planning');
  let mine=await handlePublishingWorkflow(request('projects'),env);
  assert.equal((await mine.json()).projects.length,1);
  mine=await handlePublishingWorkflow(request('projects',{actor:'authorB'}),env);
  assert.equal((await mine.json()).projects.length,0);
  const stolen=await handlePublishingWorkflow(request('projects/'+p.id,{actor:'authorB'}),env);
  assert.equal(stolen.status,404);
  const unauthorized=await handlePublishingWorkflow(request('projects/'+p.id+'/transition',{
    actor:'authorB',method:'POST',body:{action:'revise',revision:1,manuscriptDigest:'a'.repeat(64)}
  }),env);
  assert.equal(unauthorized.status,404);

  // A user cannot self-proclaim publisher through JSON; only a trusted DB grant authorizes.
  const fake=await handlePublishingWorkflow(request('projects/'+p.id+'/transition',{
    actor:'authorA',method:'POST',body:{role:'publisher',action:'publisher_approve',revision:1,digest:'a'.repeat(64)}
  }),env);
  assert.equal(fake.status,403);
  sql.prepare('INSERT INTO publishing_workflow_roles (user_id,role,granted_by,granted_at) VALUES (?,?,?,?)')
    .run('editor','editor','admin','2026-10-29T00:00:00Z');
  const actorView=await handlePublishingWorkflow(request('projects',{actor:'editor'}),env);
  assert.equal((await actorView.json()).projects.length,1);
});
test('revision conflict, hash binding and no direct-release API',async()=>{
  const {api}=memory(),env={PUBLISH_DB:api};
  const res=await handlePublishingWorkflow(request('projects',{method:'POST',body:{
    title:'회복의 기록',fieldId:'humanities'
  }}),env);
  const p=(await res.json()).project;
  let changed=await handlePublishingWorkflow(request('projects/'+p.id+'/transition',{method:'POST',body:{
    revision:1,action:'revise',manuscriptDigest:'b'.repeat(64)
  }}),env);
  assert.equal(changed.status,200);
  const fresh=(await changed.json()).project;
  assert.equal(fresh.stage,'drafting');
  assert.equal(fresh.revision,2);
  changed=await handlePublishingWorkflow(request('projects/'+p.id+'/transition',{method:'POST',body:{
    revision:1,action:'submit'
  }}),env);
  assert.equal(changed.status,409);
  changed=await handlePublishingWorkflow(request('projects/'+p.id+'/transition',{method:'POST',body:{
    revision:2,action:'submit'
  }}),env);
  assert.equal(changed.status,200);
  const frozen=(await changed.json()).project;
  assert.equal(frozen.stage,'in_review');
  const release=await handlePublishingWorkflow(request('projects/'+p.id+'/transition',{method:'POST',body:{
    revision:3,action:'release_receipt',serverVerified:true
  }}),env);
  assert.equal(release.status,403);
});
