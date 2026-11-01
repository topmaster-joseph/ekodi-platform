// PUBLISH-PIPELINE-001 — Publisher owns private manuscripts; no bookstore DB access.
import { FIELD_CATALOG } from './publishing/human/editorial-policy.js';
import { publicationTransition, permittedAiRequest } from './publishing/workflow-policy.js';
import { verifyCommercialRelease, verifyPublishingSubmission } from './publishing/release-entitlement.js';

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
// PUBLISHING-ROLES-001: 인증 서버가 확인한 이메일과 초대가 일치할 때만 한 번 권한을 받는다.
async function claimInvite(db,u){
  if(!u.email)return null;
  const inv=await db.prepare('SELECT role FROM publishing_workflow_role_invites WHERE email=? AND claimed_at IS NULL').bind(u.email).first();
  if(!inv)return null;
  const time=now();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO publishing_workflow_roles (user_id,role,granted_by,granted_at) VALUES (?,?,?,?)').bind(u.userId,inv.role,'invite:'+u.email,time),
    db.prepare('UPDATE publishing_workflow_role_invites SET claimed_by=?,claimed_at=? WHERE email=? AND claimed_at IS NULL').bind(u.userId,time,u.email),
    roleAudit(db,u.userId,'role_invite_claimed',null,inv.role,{email:maskEmail(u.email)})
  ]);
  return role(db,u.userId);
}
const ROLES=['editor','publisher','admin'];
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const maskEmail=e=>{const [a,d]=String(e||'').split('@');return d?(a.slice(0,2)+'***@'+d):'…';};
function roleAudit(db,actor,action,from,to,detail={}){
  return db.prepare("INSERT INTO publishing_workflow_audit (id,project_id,actor_user_id,action,from_stage,to_stage,revision,details_json,created_at) VALUES (?,'roles',?,?,?,?,0,?,?)")
    .bind(crypto.randomUUID(),actor,action,from,to,JSON.stringify(detail).slice(0,500),now());
}
const roleRef=async id=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('publishing-role:'+id)))].slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('');
async function adminRoles(db){
  const rows=(await db.prepare('SELECT user_id,role,granted_at FROM publishing_workflow_roles ORDER BY granted_at DESC LIMIT 200').all()).results||[];
  const invites=(await db.prepare('SELECT email,role,invited_at,claimed_at FROM publishing_workflow_role_invites ORDER BY invited_at DESC LIMIT 200').all()).results||[];
  return {roles:await Promise.all(rows.map(async x=>({user:maskId(x.user_id),ref:await roleRef(x.user_id),role:x.role,grantedAt:x.granted_at}))),
    invites:invites.map(x=>({email:maskEmail(x.email),role:x.role,invitedAt:x.invited_at,claimedAt:x.claimed_at}))};
}
// 출판 관리자만: 초대(이메일+권한), 초대 취소, 권한 회수. 자기 자신과 마지막 관리자는 바꿀 수 없다.
async function changeRoles(db,req,u){
  const body=await input(req);if(!body||typeof body!=='object')return error(400,'INVALID_INPUT');
  const action=String(body.action||'');
  if(action==='invite'){
    const email=String(body.email||'').trim().toLowerCase(),r=String(body.role||'');
    if(!EMAIL.test(email)||!ROLES.includes(r))return error(400,'INVALID_INVITE');
    if(email===u.email)return error(409,'CANNOT_CHANGE_SELF');
    await db.batch([
      db.prepare('INSERT INTO publishing_workflow_role_invites (email,role,invited_by,invited_at) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,invited_by=excluded.invited_by,invited_at=excluded.invited_at,claimed_by=NULL,claimed_at=NULL WHERE claimed_at IS NULL').bind(email,r,u.userId,now()),
      roleAudit(db,u.userId,'role_invited',null,r,{email:maskEmail(email)})
    ]);
    return result(200,{ok:true,...await adminRoles(db)});
  }
  if(action==='cancel_invite'){
    const email=String(body.email||'').trim().toLowerCase();if(!EMAIL.test(email))return error(400,'INVALID_INVITE');
    await db.batch([db.prepare('DELETE FROM publishing_workflow_role_invites WHERE email=? AND claimed_at IS NULL').bind(email),
      roleAudit(db,u.userId,'role_invite_cancelled',null,null,{email:maskEmail(email)})]);
    return result(200,{ok:true,...await adminRoles(db)});
  }
  if(action==='revoke'){
    const want=String(body.ref||'');if(!/^[a-f0-9]{24}$/.test(want))return error(400,'INVALID_TARGET');
    const all=(await db.prepare('SELECT user_id,role FROM publishing_workflow_roles').all()).results||[];
    let t=null;for(const x of all)if(await roleRef(x.user_id)===want){t=x;break;}
    if(!t)return error(404,'NOT_FOUND');
    const ref=t.user_id;if(ref===u.userId)return error(409,'CANNOT_CHANGE_SELF');
    if(t.role==='admin'){const n=await db.prepare("SELECT COUNT(*) AS n FROM publishing_workflow_roles WHERE role='admin'").first();if(Number(n?.n)<=1)return error(409,'LAST_ADMIN');}
    await db.batch([db.prepare('DELETE FROM publishing_workflow_roles WHERE user_id=?').bind(ref),
      roleAudit(db,u.userId,'role_revoked',t.role,null,{user:maskId(ref)})]);
    return result(200,{ok:true,...await adminRoles(db)});
  }
  return error(400,'UNKNOWN_ACTION');
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
async function transition(env,db,p,req,u,r){
  const x=await input(req);
  if(!x||!Number.isInteger(x.revision))return error(400,'REVISION_REQUIRED');
  if(x.revision!==p.revision)return error(409,'REVISION_CONFLICT');
  // Signed dual-channel dispatch is intentionally unavailable through HTTP.
  if(x.action==='release_receipt')return error(403,'SIGNED_DISPATCHER_REQUIRED');
  const verification=x.action==='submit' ? await verifyPublishingSubmission(env,p) :
    ['publisher_approve','schedule','prepare_handoff'].includes(x.action)
      ? await verifyCommercialRelease(env,p):{};
  const changed=publicationTransition(p,x.action,x,{...u,role:r},new Date(),verification);
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
const maskId=id=>{const v=String(id||'');return v.length>8?v.slice(0,4)+'…'+v.slice(-4):'…';};
async function recentAudit(db,limit){
  const rows=(await db.prepare(`SELECT a.action,a.from_stage,a.to_stage,a.revision,a.created_at,a.actor_user_id,p.title
    FROM publishing_workflow_audit a LEFT JOIN publishing_workflow_projects p ON p.id=a.project_id
    ORDER BY a.created_at DESC LIMIT ?`).bind(limit).all()).results||[];
  return rows.map(x=>({action:x.action,from:x.from_stage,to:x.to_stage,revision:x.revision,at:x.created_at,actor:maskId(x.actor_user_id),title:x.title||''}));
}
async function adminSummary(db,r){
  const count=async sql=>(((await db.prepare(sql).all()).results)||[]);
  const [stages,contracts,audio,roles]=await Promise.all([
    count('SELECT stage AS k, COUNT(*) AS n FROM publishing_workflow_projects GROUP BY stage'),
    count('SELECT status AS k, COUNT(*) AS n FROM publishing_workflow_release_contracts GROUP BY status'),
    count('SELECT stage AS k, COUNT(*) AS n FROM publishing_workflow_audio_release_qa GROUP BY stage'),
    count('SELECT role AS k, COUNT(*) AS n FROM publishing_workflow_roles GROUP BY role'),
  ]);
  const map=rows=>Object.fromEntries(rows.map(x=>[x.k,Number(x.n)||0]));
  const review=(await db.prepare(`SELECT id,title,stage,updated_at FROM publishing_workflow_projects
    WHERE stage IN ('in_review','ready_for_author','author_approved','publisher_approved','scheduled','handoff_ready')
    ORDER BY updated_at DESC LIMIT 50`).all()).results||[];
  return {ok:true,role:r,stages:map(stages),contracts:map(contracts),audioQa:map(audio),roles:map(roles),
    review:review.map(x=>({id:x.id,title:x.title,stage:x.stage,updatedAt:x.updated_at})),
    recent:await recentAudit(db,20),saleActivationEnabled:false};
}

export async function handlePublishingWorkflow(req,env){
  const path=new URL(req.url).pathname.replace(/^\/publishing(?=\/)/,'');
  if(path==='/api/workflow/health')return result(200,{ok:true,
    dbConfigured:Boolean(env?.PUBLISH_DB),saleActivationEnabled:false,paidAiEnabled:false});
  if(!path.startsWith('/api/workflow/'))return error(404,'NOT_FOUND');
  if(!env?.PUBLISH_DB)return error(503,'PUBLISH_DB_NOT_CONFIGURED');
  try {
    const u=await identity(req,env);if(!u)return error(401,'LOGIN_REQUIRED');
    const db=env.PUBLISH_DB;let r=await role(db,u.userId);
    if(r==='author')r=(await claimInvite(db,u))||r;
    if(path==='/api/workflow/projects'){
      if(req.method==='POST')return create(db,req,u);
      if(req.method==='GET')return list(db,u,r);
    }
    if(path==='/api/workflow/due'&&req.method==='GET'){
      if(!['publisher','admin'].includes(r))return error(403,'PUBLISHER_ONLY');
      const data=await db.prepare("SELECT id,title,edition_id,scheduled_at FROM publishing_workflow_projects WHERE stage='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 100").bind(now()).all();
      return result(200,{ok:true,due:data.results||[],note:'인계 후보이며 자동 판매가 아님'});
    }
    // PUBLISHING-ADMIN-001 (§12): 출판 관리자 화면용 읽기 전용 요약. 권한은 출판 원장 역할로만 판단한다.
    if(path.startsWith('/api/workflow/admin/')&&req.method==='GET'){
      const staff=['editor','publisher','admin'].includes(r);
      if(!staff)return error(403,'PUBLISHING_STAFF_ONLY');
      if(path==='/api/workflow/admin/summary')return result(200,await adminSummary(db,r));
      if(path==='/api/workflow/admin/audit')return result(200,{ok:true,role:r,events:await recentAudit(db,100)});
      if(path==='/api/workflow/admin/roles'){
        if(r!=='admin')return error(403,'PUBLISHING_ADMIN_ONLY');
        return result(200,{ok:true,role:r,...await adminRoles(db)});
      }
      return error(404,'NOT_FOUND');
    }
    if(path==='/api/workflow/admin/roles'&&req.method==='POST'){
      if(r!=='admin')return error(403,'PUBLISHING_ADMIN_ONLY');
      return changeRoles(db,req,u);
    }
    const match=/^\/api\/workflow\/projects\/([0-9a-f-]{36})(?:\/(.*))?$/.exec(path);
    if(!match)return error(404,'NOT_FOUND');
    const p=project(await db.prepare('SELECT * FROM publishing_workflow_projects WHERE id=?').bind(match[1]).first());
    if(!p||!visible(p,u,r))return error(404,'NOT_FOUND');
    const endpoint=match[2]||'';
    if(!endpoint&&req.method==='GET')return result(200,{ok:true,project:safe(p)});
    if(endpoint==='readiness'&&req.method==='GET'){
      const gate=await verifyCommercialRelease(env,p);
      return result(200,{ok:true,stage:p.stage,saleReadyForPublisherReview:gate.ready,
        blocker:gate.ready?null:gate.reason,publicationActive:false,
        note:'이 결과는 비공개 계약·오디오 검수 기록이며 실제 서점·몰 상품 등록과 결제를 증명하지 않습니다.'});
    }
    if(endpoint==='transition'&&req.method==='POST')return transition(env,db,p,req,u,r);
    if(endpoint==='evidence'&&req.method==='POST')return evidence(db,p,req,u,r);
    if(endpoint==='ai'&&req.method==='POST')return ai(db,p,req,u);
    if(endpoint==='ai'&&req.method==='GET')return jobs(db,p);
    return error(404,'NOT_FOUND');
  }catch{return error(503,'PUBLISHING_WORKFLOW_UNAVAILABLE')}
}

/** Cloudflare Cron only. Never exposed as an HTTP action or user-callable dispatcher. */
export async function prepareScheduledPublishing(env, at=new Date()) {
  if(!env?.PUBLISH_DB)return {ok:false,code:'PUBLISH_DB_NOT_CONFIGURED',prepared:0};
  const db=env.PUBLISH_DB,time=at.toISOString(),summary={ok:true,prepared:0,blocked:0};
  const due=await db.prepare("SELECT * FROM publishing_workflow_projects WHERE stage='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 50")
    .bind(time).all();
  for(const row of due.results||[]){
    const p=project(row),system={userId:'system:publishing-cron',role:'publisher'};
    const verification=await verifyCommercialRelease(env,p,at).catch(()=>({ready:false,reason:'VERIFICATION_UNAVAILABLE'}));
    const checked=publicationTransition(p,'prepare_handoff',{},system,at,verification);
    if(!checked.ok){summary.blocked++;continue}
    const event=checked.next.handoffProposal;
    if(!event?.idempotencyKey||!event?.releaseDigest){summary.blocked++;continue}
    const eventId=crypto.randomUUID(),revision=p.revision+1;
    try {
      const actions=await db.batch([
        db.prepare("UPDATE publishing_workflow_projects SET stage='handoff_ready',ready_at=?,revision=?,last_event_id=?,updated_at=? WHERE id=? AND stage='scheduled' AND revision=? AND scheduled_at<=? AND release_digest=?")
          .bind(time,revision,eventId,time,p.id,p.revision,time,p.releaseDigest),
        db.prepare("INSERT OR IGNORE INTO publishing_workflow_handoff_outbox (id,project_id,edition_id,release_digest,idempotency_key,payload_json,status,created_at,updated_at) SELECT ?,?,?,?,?,?,'pending',?,? WHERE EXISTS (SELECT 1 FROM publishing_workflow_projects WHERE id=? AND revision=? AND last_event_id=?)")
          .bind(eventId,p.id,p.editionId,p.releaseDigest,event.idempotencyKey,JSON.stringify(event),time,time,
            p.id,revision,eventId),
        db.prepare("INSERT INTO publishing_workflow_audit (id,project_id,actor_user_id,action,from_stage,to_stage,revision,created_at) SELECT ?,?,'system:publishing-cron','prepare_handoff','scheduled','handoff_ready',?,? WHERE EXISTS (SELECT 1 FROM publishing_workflow_projects WHERE id=? AND revision=? AND last_event_id=?)")
          .bind(crypto.randomUUID(),p.id,revision,time,p.id,revision,eventId)
      ]);
      if(Number(actions?.[0]?.meta?.changes??actions?.[0]?.changes??0)===1 &&
        Number(actions?.[1]?.meta?.changes??actions?.[1]?.changes??0)===1 &&
        Number(actions?.[2]?.meta?.changes??actions?.[2]?.changes??0)===1)summary.prepared++;
      else summary.blocked++;
    }catch{summary.blocked++}
  }
  // This function never signs, sends or activates a product.
  return summary;
}
