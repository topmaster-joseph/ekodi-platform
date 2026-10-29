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

test('cloud scheduler advances only a fully reviewed due edition into nonpublic outbox',async()=>{
  const {sql,api}=memory();
  const chief='00000000-0000-4000-8000-000000000777';
  const env={PUBLISH_DB:api,PUBLISH_CHIEF_AUTHOR_IDS:chief};
  const res=await handlePublishingWorkflow(request('projects',{method:'POST',body:{
    title:'예약 출간 테스트',fieldId:'literature'
  }}),env);
  const {project:p}=await res.json(),hash='c'.repeat(64);
  sql.prepare('UPDATE publishing_workflow_projects SET author_user_id=? WHERE id=?').run(chief,p.id);
  sql.prepare('INSERT INTO publishing_workflow_roles (user_id,role,granted_by,granted_at) VALUES (?,?,?,?)')
    .run(chief,'admin','protected-bootstrap','2026-10-29T00:00:00Z');
  const candidate={format:'epub',priceKrw:9900,readerProfiles:['general'],collectionId:'human'};
  const placeholders={publicationId:p.id,editionId:p.editionId,title:p.title,authorId:chief,
    fieldId:'literature',releaseDigest:hash,
    publisherApproval:{approvedBy:'publisher',approvedAt:'2026-11-20T00:00:00Z',digest:hash}};
  for(const name of evaluateReleaseReadiness({...candidate,...placeholders}).blockers){
    const pieces=name.split('.');assert.equal(pieces.length,2);
    candidate[pieces[0]]??={};candidate[pieces[0]][pieces[1]]=true;
  }
  sql.prepare("UPDATE publishing_workflow_projects SET stage='scheduled',manuscript_digest=?,release_digest=?,release_candidate_json=?,author_approval_json=?,publisher_approval_json=?,scheduled_at=? WHERE id=?")
    .run('b'.repeat(64),hash,JSON.stringify(candidate),JSON.stringify({digest:hash,approvedAt:'2026-11-19T00:00:00Z'}),
      JSON.stringify(placeholders.publisherApproval),'2026-11-25T01:00:00.000Z',p.id);
  // Audio and contracts are protected, separately attested database records, not client toggles.
  sql.prepare("INSERT INTO publishing_workflow_release_contracts (project_id,author_user_id,edition_digest,status,author_signed_at,publisher_signed_at,distribution_license_accepted,sealed_contract_sha256,created_at,updated_at) VALUES (?,?,?,'signed',?,?,1,?,?,?)")
    .run(p.id,chief,hash,'2026-11-19T00:00:00Z','2026-11-20T00:00:00Z','a'.repeat(64),'2026-11-20T00:00:00Z','2026-11-20T00:00:00Z');
  sql.prepare("INSERT INTO publishing_workflow_audio_release_qa (project_id,edition_digest,stage,master_sha256,voice_license_verified,dialogue_qa_passed,full_track_qa_passed,buyer_access_verified,refund_revoke_verified,bonus_price_krw,verified_at) VALUES (?,?,'approved',?,1,1,1,1,1,0,?)")
    .run(p.id,hash,'b'.repeat(64),'2026-11-20T00:00:00Z');
  const run=await prepareScheduledPublishing(env,new Date('2026-11-25T01:00:01.000Z'));
  assert.deepEqual(run,{ok:true,prepared:1,blocked:0});
  const row=sql.prepare("SELECT stage FROM publishing_workflow_projects WHERE id=?").get(p.id);
  assert.equal(row.stage,'handoff_ready');
  const outbox=sql.prepare("SELECT status,payload_json FROM publishing_workflow_handoff_outbox").get();
  assert.equal(outbox.status,'pending');
  assert.equal(JSON.parse(outbox.payload_json).deliveryState,'not_dispatched');
  assert.deepEqual(await prepareScheduledPublishing(env,new Date('2026-11-25T01:20:00.000Z')),
    {ok:true,prepared:0,blocked:0});
});
test('cron cannot bypass a missing author digest or reviewer compliance flags',async()=>{
  const {sql,api}=memory();
  sql.prepare("INSERT INTO publishing_workflow_projects (id,author_user_id,title,field_id,collection_id,edition_id,stage,release_digest,scheduled_at,created_at,updated_at) VALUES (?,?,?,?,'human',?,'scheduled',?,?,?,?)")
    .run('00000000-0000-4000-8000-000000000001','writer','미승인','literature','v1','d'.repeat(64),
      '2026-11-25T01:00:00.000Z','2026-10-29T00:00:00Z','2026-10-29T00:00:00Z');
  const v=await prepareScheduledPublishing({PUBLISH_DB:api},new Date('2026-11-26T00:00:00Z'));
  assert.deepEqual(v,{ok:true,prepared:0,blocked:1});
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM publishing_workflow_handoff_outbox').get().n,0);
});
