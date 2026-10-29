// PUBLISH-PIPELINE-001 — Publisher owns private manuscripts; no bookstore DB access.
import { FIELD_CATALOG } from './publishing/human/editorial-policy.js';
import { publicationTransition, permittedAiRequest } from './publishing/workflow-policy.js';

const fields = new Set(FIELD_CATALOG.map(x=>x.id));
const HASH=/^[a-f0-9]{64}$/, UUID=/^[0-9a-f-]{36}$/;
const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
const PUBLIC_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const now=()=>new Date().toISOString(),parse=x=>{try{return JSON.parse(x)}catch{return null}};
const result=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const error=(status,code)=>result(status,{ok:false,code});
async function input(req){const raw=await req.text();if(raw.length>18000)return null;return parse(raw);}
async function identity(req,env){
  const bearer=req.headers.get('authorization')||'';
  if(!/^Bearer [^\s]{20,8192}$/i.test(bearer))return null;
  const res=await fetch((env?.PUBLISH_AUTH_URL||SUPABASE)+'/auth/v1/user',{
    headers:{apikey:env?.PUBLISH_AUTH_PUBLIC_KEY||PUBLIC_KEY,authorization:bearer},
    cache:'no-store',signal:AbortSignal.timeout(7000)
  });
  const user=res.ok?await res.json().catch(()=>null):null;
  return user?.id&&user?.email_confirmed_at?{userId:String(user.id),email:String(user.email||'').toLowerCase()}:null;
}
async function role(db,id){
  const r=await db.prepare('SELECT role FROM publishing_workflow_roles WHERE user_id=?').bind(id).first();
  return r?.role||'author';
}
function project(row){
  if(!row)return null;
  return {id:row.id,publicationId:row.id,editionId:row.edition_id,authorUserId:row.author_user_id,
    title:row.title,fieldId:row.field_id,collectionId:row.collection_id,stage:row.stage,
    manuscriptDigest:row.manuscript_digest,releaseDigest:row.release_digest,
    releaseCandidate:parse(row.release_candidate_json)||{},
    authorApproval:parse(row.author_approval_json),publisherApproval:parse(row.publisher_approval_json),
    scheduledAt:row.scheduled_at,readyAt:row.ready_at,releasedAt:row.released_at,
    releaseChannels:parse(row.channels_json),revision:row.revision,
    createdAt:row.created_at,updatedAt:row.updated_at};
}
const visible=(p,u,r)=>p.authorUserId===u.userId||['editor','publisher','admin'].includes(r);
function safe(p){return {...p,releaseCandidate:undefined,authorApproval:p.authorApproval?{approvedAt:p.authorApproval.approvedAt}:null,
  publisherApproval:p.publisherApproval?{approvedAt:p.publisherApproval.approvedAt}:null};}
async function audit(db,p,u,action,from,to,revision,detail={}){
  await db.prepare("INSERT INTO publishing_workflow_audit (id,project_id,actor_user_id,action,from_stage,to_stage,revision,details_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),p.id,u.userId,action,from,to,revision,JSON.stringify(detail).slice(0,500),now()).run();
}
async function persist(db,p,n,u,action){
  const revision=p.revision+1,eventId=crypto.randomUUID(),time=now();
  // D1 batch is transactional: an audit record is inserted only when THIS update wins
  // the optimistic revision check. Both statements roll back together on failure.
  const outcomes=await db.batch([
    db.prepare("UPDATE publishing_workflow_projects SET stage=?,manuscript_digest=?,release_digest=?,release_candidate_json=?,author_approval_json=?,publisher_approval_json=?,scheduled_at=?,ready_at=?,released_at=?,channels_json=?,revision=?,last_event_id=?,updated_at=? WHERE id=? AND revision=?")
      .bind(n.stage,n.manuscriptDigest||null,n.releaseDigest||null,JSON.stringify(n.releaseCandidate||{}),
        JSON.stringify(n.authorApproval||null),JSON.stringify(n.publisherApproval||null),
        n.scheduledAt||null,n.readyAt||null,n.releasedAt||null,JSON.stringify(n.releaseChannels||null),
        revision,eventId,time,p.id,p.revision),
    db.prepare("INSERT INTO publishing_workflow_audit (id,project_id,actor_user_id,action,from_stage,to_stage,revision,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM publishing_workflow_projects WHERE id=? AND revision=? AND last_event_id=?)")
      .bind(eventId,p.id,u.userId,action,p.stage,n.stage,revision,time,p.id,revision,eventId)
  ]);
  if(Number(outcomes?.[0]?.meta?.changes??outcomes?.[0]?.changes??0)!==1)return null;
  if(Number(outcomes?.[1]?.meta?.changes??outcomes?.[1]?.changes??0)!==1)throw Error('MISSING_AUDIT');
  return {...n,revision};
}
async function create(db,req,u){
  const x=await input(req),title=String(x?.title||'').trim(),field=x?.fieldId;
  if(title.length<2||title.length>180||!fields.has(field)||x?.collectionId==='ekodian')return error(400,'BAD_PROJECT');
  const id=crypto.randomUUID(),t=now();
  await db.prepare("INSERT INTO publishing_workflow_projects (id,author_user_id,title,field_id,collection_id,edition_id,created_at,updated_at) VALUES (?,?,?,?,'human',?,?,?)")
    .bind(id,u.userId,title,field,id+':v1',t,t).run();
  const p=project(await db.prepare('SELECT * FROM publishing_workflow_projects WHERE id=?').bind(id).first());
  await audit(db,p,u,'create',null,'planning',1);
  return result(201,{ok:true,project:safe(p)});
}
async function list(db,u,r){
  const privileged=['editor','publisher','admin'].includes(r);
  const statement=privileged?
    db.prepare('SELECT * FROM publishing_workflow_projects ORDER BY updated_at DESC LIMIT 100'):
    db.prepare('SELECT * FROM publishing_workflow_projects WHERE author_user_id=? ORDER BY updated_at DESC LIMIT 100').bind(u.userId);
  const rows=await statement.all();
  return result(200,{ok:true,role:r,projects:(rows.results||[]).map(x=>safe(project(x)))});
}
async function transition(db,p,req,u,r){
  const x=await input(req);
  if(!x||!Number.isInteger(x.revision))return error(400,'REVISION_REQUIRED');
  if(x.revision!==p.revision)return error(409,'REVISION_CONFLICT');
  // Signed dual-channel dispatch is intentionally unavailable through HTTP.
  if(x.action==='release_receipt')return error(403,'SIGNED_DISPATCHER_REQUIRED');
  const changed=publicationTransition(p,x.action,x,{...u,role:r});
  if(!changed.ok)return result(changed.code==='FORBIDDEN'?403:409,changed);
  const saved=await persist(db,p,changed.next,u,x.action);
  return saved?result(200,{ok:true,project:safe(saved)}):error(409,'REVISION_CONFLICT');
}
async function evidence(db,p,req,u,r){
  if(!['editor','publisher','admin'].includes(r))return error(403,'EDITOR_ONLY');
  if(p.stage!=='in_review')return error(409,'NOT_IN_REVIEW');
  const x=await input(req);
  if(!x||!Number.isInteger(x.revision)||x.revision!==p.revision)return error(409,'REVISION_CONFLICT');
  if(!HASH.test(String(x.releaseDigest||''))||x.manuscriptDigest!==p.manuscriptDigest||
    !x.releaseCandidate||typeof x.releaseCandidate!=='object'||Array.isArray(x.releaseCandidate))
    return error(400,'EVIDENCE_INVALID');
  // A reviewer may record QA evidence, but the publisher still must approve the exact digest.
  const saved=await persist(db,p,{...p,releaseDigest:x.releaseDigest,
    releaseCandidate:x.releaseCandidate},u,'evidence_recorded');
  return saved?result(200,{ok:true,project:safe(saved)}):error(409,'REVISION_CONFLICT');
}
async function ai(db,p,req,u){
  if(p.authorUserId!==u.userId)return error(403,'AUTHOR_ONLY');
  if(!['planning','drafting','changes_requested'].includes(p.stage))return error(409,'EDITION_FROZEN');
  const x=await input(req);
  const check=permittedAiRequest(x?.kind,{provider:x?.provider||'core',spendKrw:x?.spendKrw||0,
    ownerConsent:x?.ownerConsent===true});
  if(!check.ok)return error(400,check.code);
  const id=crypto.randomUUID(),t=now();
  await db.prepare("INSERT INTO publishing_workflow_ai_jobs (id,project_id,author_user_id,kind,source_revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id,p.id,u.userId,check.kind,p.revision,t,t).run();
  await audit(db,p,u,'ai_job_queued',p.stage,p.stage,p.revision,{id,kind:check.kind});
  return result(202,{ok:true,job:{id,kind:check.kind,status:'queued',provider:'core',spendKrw:0}});
}
async function jobs(db,p){
  const data=await db.prepare('SELECT id,kind,status,source_revision,created_at FROM publishing_workflow_ai_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 100')
    .bind(p.id).all();
  return result(200,{ok:true,jobs:data.results||[]});
}
export async function handlePublishingWorkflow(req,env){
  const path=new URL(req.url).pathname.replace(/^\/publishing(?=\/)/,'');
  if(path==='/api/workflow/health')return result(200,{ok:true,
    dbConfigured:Boolean(env?.PUBLISH_DB),saleActivationEnabled:false,paidAiEnabled:false});
  if(!path.startsWith('/api/workflow/'))return error(404,'NOT_FOUND');
  if(!env?.PUBLISH_DB)return error(503,'PUBLISH_DB_NOT_CONFIGURED');
  try {
    const u=await identity(req,env);if(!u)return error(401,'LOGIN_REQUIRED');
    const db=env.PUBLISH_DB,r=await role(db,u.userId);
    if(path==='/api/workflow/projects'){
      if(req.method==='POST')return create(db,req,u);
      if(req.method==='GET')return list(db,u,r);
    }
    if(path==='/api/workflow/due'&&req.method==='GET'){
      if(!['publisher','admin'].includes(r))return error(403,'PUBLISHER_ONLY');
      const data=await db.prepare("SELECT id,title,edition_id,scheduled_at FROM publishing_workflow_projects WHERE stage='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 100").bind(now()).all();
      return result(200,{ok:true,due:data.results||[],note:'인계 후보이며 자동 판매가 아님'});
    }
    const match=/^\/api\/workflow\/projects\/([0-9a-f-]{36})(?:\/(.*))?$/.exec(path);
    if(!match)return error(404,'NOT_FOUND');
    const p=project(await db.prepare('SELECT * FROM publishing_workflow_projects WHERE id=?').bind(match[1]).first());
    if(!p||!visible(p,u,r))return error(404,'NOT_FOUND');
    const endpoint=match[2]||'';
    if(!endpoint&&req.method==='GET')return result(200,{ok:true,project:safe(p)});
    if(endpoint==='transition'&&req.method==='POST')return transition(db,p,req,u,r);
    if(endpoint==='evidence'&&req.method==='POST')return evidence(db,p,req,u,r);
    if(endpoint==='ai'&&req.method==='POST')return ai(db,p,req,u);
    if(endpoint==='ai'&&req.method==='GET')return jobs(db,p);
    return error(404,'NOT_FOUND');
  }catch{return error(503,'PUBLISHING_WORKFLOW_UNAVAILABLE')}
}
