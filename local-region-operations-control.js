import { localRegionBySlug } from './local-region-registry.js';
import { resolveRegionalAccess } from './regional-access-control.js';
import { TENANT_ADMIN_CAPABILITIES } from './tenant-admin-policy.js';

const clean=value=>String(value||'').trim().toLowerCase();
const OPERATOR_ID=/^[a-z0-9][a-z0-9-]{0,63}$/;
const OPERATOR_KINDS=new Set(['organization','merchant-association','public-agency','school','cooperative','project']);
const ASSIGNMENT_ACTIONS=new Set(['add_co_operator','start_transfer','complete_transfer','suspend_assignment','reactivate_assignment','revoke_assignment']);

function json(request,data,status=200){
  const origin=request.headers.get('origin')||'';
  const headers={
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'strict-origin-when-cross-origin',
  };
  if(origin==='https://ekodi.kr'){headers['access-control-allow-origin']=origin;headers.vary='Origin';}
  return new Response(JSON.stringify(data),{status,headers});
}

function capabilities(access){return new Set(access?.capabilities||[]);}
function canReadOperations(access){
  const set=capabilities(access);
  return Boolean(access?.ok)&&(access.platform||set.has('*')||set.has(TENANT_ADMIN_CAPABILITIES.operations));
}
function canManageOperatingRights(access){
  const set=capabilities(access);
  const operations=access?.platform||set.has('*')||set.has(TENANT_ADMIN_CAPABILITIES.operations);
  const accessAdmin=access?.platform||Boolean(access?.canManageAccess)&& (set.has('*')||set.has(TENANT_ADMIN_CAPABILITIES.access));
  return Boolean(access?.ok)&&operations&&accessAdmin;
}
function sameOriginForWrite(request){
  const origin=String(request.headers.get('origin')||'').trim();
  return !origin||origin==='https://ekodi.kr';
}
function moduleById(region,moduleId){return region.modules.find(item=>item.id===clean(moduleId))||null;}
function operatorLabel(region,directory,rowOperatorId){
  return directory.get(rowOperatorId)?.name||region.operators[rowOperatorId]?.name||rowOperatorId;
}
function eventKey(regionId,moduleId,operatorId,eventType){
  return [regionId,moduleId,operatorId,eventType,Date.now(),crypto.randomUUID()].join(':');
}

async function readDirectory(env,regionId){
  const rows=await env.DB.prepare(`
    SELECT region_id,operator_id,tenant_slug,name,kind,status,public_path,admin_path,created_at,updated_at
    FROM local_region_operators
    WHERE region_id=?
    ORDER BY name,operator_id
  `).bind(regionId).all();
  return rows.results||[];
}
function directoryMap(rows){return new Map(rows.map(row=>[row.operator_id,row]));}

function publicOperator(row){
  return {
    operatorId:row.operator_id,
    tenantSlug:row.tenant_slug,
    name:row.name,
    kind:row.kind,
    status:row.status,
    publicPath:row.public_path||'',
    adminPath:row.admin_path||'',
    createdAt:row.created_at,
    updatedAt:row.updated_at,
  };
}
function publicAssignment(region,directory,row){
  const module=region.modules.find(item=>item.id===row.module_id);
  return {
    moduleId:row.module_id,
    moduleLabel:module?.label||row.module_id,
    operatorId:row.operator_id,
    operatorName:operatorLabel(region,directory,row.operator_id),
    operatorTenantSlug:row.operator_tenant_slug,
    role:row.role,
    status:row.status,
    effectiveFrom:row.effective_from,
    effectiveTo:row.effective_to||'',
    note:row.note||'',
    updatedAt:row.updated_at,
  };
}
function publicEvent(region,directory,row){
  const module=region.modules.find(item=>item.id===row.module_id);
  return {
    id:Number(row.id),
    moduleId:row.module_id,
    moduleLabel:module?.label||row.module_id,
    operatorId:row.operator_id,
    operatorName:operatorLabel(region,directory,row.operator_id),
    eventType:row.event_type,
    fromRole:row.from_role||'',
    toRole:row.to_role||'',
    actorEmail:row.actor_email||'',
    reason:row.reason||'',
    eventAt:row.event_at,
  };
}

async function tenantForRegistration(env,tenantSlug){
  return env.DB.prepare('SELECT slug,name,status FROM customer_tenants WHERE slug=? LIMIT 1').bind(tenantSlug).first();
}
async function operatorRow(env,regionId,operatorId){
  return env.DB.prepare(`
    SELECT region_id,operator_id,tenant_slug,name,kind,status,public_path,admin_path,created_at,updated_at
    FROM local_region_operators WHERE region_id=? AND operator_id=? LIMIT 1
  `).bind(regionId,operatorId).first();
}
async function assignmentRow(env,regionId,moduleId,operatorId){
  return env.DB.prepare(`
    SELECT region_id,module_id,operator_id,operator_tenant_slug,role,status,effective_from,effective_to,note,created_at,updated_at
    FROM local_region_operator_assignments
    WHERE region_id=? AND module_id=? AND operator_id=? LIMIT 1
  `).bind(regionId,moduleId,operatorId).first();
}
async function activeLeadRows(env,regionId,moduleId){
  const rows=await env.DB.prepare(`
    SELECT region_id,module_id,operator_id,operator_tenant_slug,role,status,effective_from,effective_to,note,created_at,updated_at
    FROM local_region_operator_assignments
    WHERE region_id=? AND module_id=? AND role='lead_operator' AND status IN ('active','handover')
    ORDER BY operator_id
  `).bind(regionId,moduleId).all();
  return rows.results||[];
}
async function insertEvent(env,{region,moduleId,operatorId,eventType,fromRole='',toRole='',actorEmail='',reason='',eventAt}){
  return env.DB.prepare(`
    INSERT INTO local_region_operator_events
    (event_key,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `).bind(eventKey(region.id,moduleId,operatorId,eventType),region.id,moduleId,operatorId,eventType,fromRole,toRole,actorEmail,reason,eventAt).run();
}

async function registerOperator(request,env,region,access,body){
  const tenantSlug=clean(body.tenantSlug);
  const operatorId=clean(body.operatorId||tenantSlug);
  if(!OPERATOR_ID.test(operatorId)||!OPERATOR_ID.test(tenantSlug)){
    return json(request,{error:'운영단체 ID와 운영공간 ID 형식이 올바르지 않습니다.',code:'LOCAL_REGION_OPERATOR_ID_INVALID'},400);
  }
  const tenant=await tenantForRegistration(env,tenantSlug);
  if(!tenant||tenant.status!=='active'){
    return json(request,{error:'활성 운영공간을 먼저 등록해야 합니다.',code:'LOCAL_REGION_OPERATOR_TENANT_REQUIRED'},409);
  }
  const name=String(body.name||tenant.name||operatorId).trim().slice(0,120);
  const kind=OPERATOR_KINDS.has(clean(body.kind))?clean(body.kind):'organization';
  const publicPath=String(body.publicPath||'').trim().slice(0,240);
  const adminPath=String(body.adminPath||'').trim().slice(0,240);
  const now=new Date().toISOString();
  try{
    await env.DB.prepare(`
      INSERT INTO local_region_operators
      (region_id,operator_id,tenant_slug,name,kind,status,public_path,admin_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'active',?,?,?,?)
      ON CONFLICT(region_id,operator_id) DO UPDATE SET
        tenant_slug=excluded.tenant_slug,
        name=excluded.name,
        kind=excluded.kind,
        status='active',
        public_path=excluded.public_path,
        admin_path=excluded.admin_path,
        updated_at=excluded.updated_at
    `).bind(region.id,operatorId,tenantSlug,name,kind,publicPath,adminPath,now,now).run();
  }catch(error){
    return json(request,{error:'같은 운영공간이 이미 다른 운영단체 ID에 연결되어 있습니다.',code:'LOCAL_REGION_OPERATOR_TENANT_CONFLICT'},409);
  }
  const row=await operatorRow(env,region.id,operatorId);
  return json(request,{ok:true,action:'register_operator',operator:publicOperator(row),actor:access.email||''},201);
}

async function mutateAssignment(request,env,region,access,body){
  const action=clean(body.action);
  if(!ASSIGNMENT_ACTIONS.has(action))return json(request,{error:'지원하지 않는 운영권 작업입니다.',code:'LOCAL_REGION_ACTION_UNKNOWN'},400);
  const module=moduleById(region,body.moduleId);
  if(!module)return json(request,{error:'등록되지 않은 지역서비스입니다.',code:'LOCAL_REGION_MODULE_UNKNOWN'},404);
  const operatorId=clean(body.operatorId);
  if(!OPERATOR_ID.test(operatorId))return json(request,{error:'운영단체 ID 형식이 올바르지 않습니다.',code:'LOCAL_REGION_OPERATOR_ID_INVALID'},400);
  const operator=await operatorRow(env,region.id,operatorId);
  if(!operator||operator.status!=='active')return json(request,{error:'활성 운영단체를 먼저 등록해야 합니다.',code:'LOCAL_REGION_OPERATOR_REQUIRED'},409);
  const now=new Date().toISOString();
  const reason=String(body.reason||body.note||'').trim().slice(0,500);
  const existing=await assignmentRow(env,region.id,module.id,operatorId);

  if(action==='add_co_operator'){
    if(existing?.role==='lead_operator'&&['active','handover'].includes(existing.status))return json(request,{error:'이미 주 운영단체입니다.',code:'LOCAL_REGION_ALREADY_LEAD'},409);
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO local_region_operator_assignments
        (region_id,module_id,operator_id,operator_tenant_slug,role,status,effective_from,effective_to,assigned_by,note,created_at,updated_at)
        VALUES(?,?,?,?, 'co_operator','active',?,NULL,?,?,?,?)
        ON CONFLICT(region_id,module_id,operator_id) DO UPDATE SET
          operator_tenant_slug=excluded.operator_tenant_slug,
          role='co_operator',status='active',effective_to=NULL,assigned_by=excluded.assigned_by,note=excluded.note,updated_at=excluded.updated_at
      `).bind(region.id,module.id,operatorId,operator.tenant_slug,existing?.effective_from||now,access.email||'system',reason,existing?.created_at||now,now),
      env.DB.prepare(`
        INSERT INTO local_region_operator_events
        (event_key,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at)
        VALUES(?,?,?,?, 'co_operator_added',?,?,?,?,?)
      `).bind(eventKey(region.id,module.id,operatorId,'co_operator_added'),region.id,module.id,operatorId,existing?.role||'', 'co_operator',access.email||'',reason,now),
    ]);
  }

  if(action==='start_transfer'){
    const leads=await activeLeadRows(env,region.id,module.id);
    if(leads.some(row=>row.operator_id===operatorId))return json(request,{error:'대상 운영단체가 이미 주 운영단체입니다.',code:'LOCAL_REGION_ALREADY_LEAD'},409);
    if(!leads.length)return json(request,{error:'현재 주 운영단체가 없어 이양을 시작할 수 없습니다.',code:'LOCAL_REGION_LEAD_REQUIRED'},409);
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO local_region_operator_assignments
        (region_id,module_id,operator_id,operator_tenant_slug,role,status,effective_from,effective_to,assigned_by,note,created_at,updated_at)
        VALUES(?,?,?,?, 'co_operator','handover',?,NULL,?,?,?,?)
        ON CONFLICT(region_id,module_id,operator_id) DO UPDATE SET
          operator_tenant_slug=excluded.operator_tenant_slug,
          role='co_operator',status='handover',effective_to=NULL,assigned_by=excluded.assigned_by,note=excluded.note,updated_at=excluded.updated_at
      `).bind(region.id,module.id,operatorId,operator.tenant_slug,existing?.effective_from||now,access.email||'system',reason,existing?.created_at||now,now),
      env.DB.prepare(`
        INSERT INTO local_region_operator_events
        (event_key,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at)
        VALUES(?,?,?,?, 'transfer_started',?,?,?,?,?)
      `).bind(eventKey(region.id,module.id,operatorId,'transfer_started'),region.id,module.id,operatorId,existing?.role||'', 'co_operator',access.email||'',reason,now),
    ]);
  }

  if(action==='complete_transfer'){
    const target=existing||await assignmentRow(env,region.id,module.id,operatorId);
    if(!target||!['active','handover'].includes(target.status))return json(request,{error:'공동운영 또는 이양중 상태를 먼저 구성해야 합니다.',code:'LOCAL_REGION_HANDOVER_REQUIRED'},409);
    const leads=await activeLeadRows(env,region.id,module.id);
    const previous=leads.filter(row=>row.operator_id!==operatorId);
    const statements=[];
    for(const lead of previous){
      statements.push(
        env.DB.prepare(`
          UPDATE local_region_operator_assignments
          SET role='co_operator',status='active',effective_to=NULL,note=?,updated_at=?
          WHERE region_id=? AND module_id=? AND operator_id=?
        `).bind(reason,now,region.id,module.id,lead.operator_id),
        env.DB.prepare(`
          INSERT INTO local_region_operator_events
          (event_key,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at)
          VALUES(?,?,?,?, 'role_changed','lead_operator','co_operator',?,?,?)
        `).bind(eventKey(region.id,module.id,lead.operator_id,'role_changed'),region.id,module.id,lead.operator_id,access.email||'',reason,now)
      );
    }
    statements.push(
      env.DB.prepare(`
        UPDATE local_region_operator_assignments
        SET operator_tenant_slug=?,role='lead_operator',status='active',effective_to=NULL,note=?,updated_at=?
        WHERE region_id=? AND module_id=? AND operator_id=?
      `).bind(operator.tenant_slug,reason,now,region.id,module.id,operatorId),
      env.DB.prepare(`
        INSERT INTO local_region_operator_events
        (event_key,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at)
        VALUES(?,?,?,?, 'transfer_completed',?,?,?,?,?)
      `).bind(eventKey(region.id,module.id,operatorId,'transfer_completed'),region.id,module.id,operatorId,target.role||'co_operator','lead_operator',access.email||'',reason,now)
    );
    await env.DB.batch(statements);
  }

  if(action==='suspend_assignment'||action==='revoke_assignment'){
    if(!existing)return json(request,{error:'운영권 배정 기록이 없습니다.',code:'LOCAL_REGION_ASSIGNMENT_NOT_FOUND'},404);
    if(existing.role==='lead_operator'&&['active','handover'].includes(existing.status)){
      return json(request,{error:'주 운영단체는 먼저 운영권 이양을 완료해야 중지·회수할 수 있습니다.',code:'LOCAL_REGION_LEAD_PROTECTED'},409);
    }
    const status=action==='suspend_assignment'?'suspended':'revoked';
    const eventType=action==='suspend_assignment'?'suspended':'revoked';
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE local_region_operator_assignments SET status=?,effective_to=?,note=?,updated_at=?
        WHERE region_id=? AND module_id=? AND operator_id=?
      `).bind(status,now,reason,now,region.id,module.id,operatorId),
      env.DB.prepare(`
        INSERT INTO local_region_operator_events
        (event_key,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at)
        VALUES(?,?,?,?,?,?,?, ?,?,?)
      `).bind(eventKey(region.id,module.id,operatorId,eventType),region.id,module.id,operatorId,eventType,existing.role,existing.role,access.email||'',reason,now),
    ]);
  }

  if(action==='reactivate_assignment'){
    if(!existing||!['suspended','revoked'].includes(existing.status))return json(request,{error:'중지 또는 회수된 운영권만 재활성화할 수 있습니다.',code:'LOCAL_REGION_REACTIVATION_INVALID'},409);
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE local_region_operator_assignments SET status='active',effective_to=NULL,note=?,updated_at=?
        WHERE region_id=? AND module_id=? AND operator_id=?
      `).bind(reason,now,region.id,module.id,operatorId),
      env.DB.prepare(`
        INSERT INTO local_region_operator_events
        (event_key,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at)
        VALUES(?,?,?,?, 'reactivated',?,?,?,?,?)
      `).bind(eventKey(region.id,module.id,operatorId,'reactivated'),region.id,module.id,operatorId,existing.role,existing.role,access.email||'',reason,now),
    ]);
  }

  return json(request,{ok:true,action,moduleId:module.id,operatorId,actor:access.email||'',updatedAt:now});
}

async function readPayload(env,region,access,{historyOnly=false,operatorsOnly=false}={}){
  const directoryRows=await readDirectory(env,region.id);
  const directory=directoryMap(directoryRows);
  if(operatorsOnly){
    return {
      region:{id:region.id,slug:region.publicSlug,name:region.name,brand:region.brand},
      modules:region.modules.map(item=>({id:item.id,label:item.label})),
      operators:directoryRows.map(publicOperator),
      access:{email:access.email||'',role:access.role||'',canManageOperatingRights:canManageOperatingRights(access)},
    };
  }
  if(historyOnly){
    const rows=await env.DB.prepare(`
      SELECT id,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at
      FROM local_region_operator_events
      WHERE region_id=?
      ORDER BY event_at DESC,id DESC
      LIMIT 100
    `).bind(region.id).all();
    return {
      region:{id:region.id,slug:region.publicSlug,name:region.name,brand:region.brand},
      history:(rows.results||[]).map(row=>publicEvent(region,directory,row)),
    };
  }
  const [assignmentRows,eventRows]=await Promise.all([
    env.DB.prepare(`
      SELECT region_id,module_id,operator_id,operator_tenant_slug,role,status,effective_from,effective_to,note,updated_at
      FROM local_region_operator_assignments
      WHERE region_id=?
      ORDER BY module_id,operator_id
    `).bind(region.id).all(),
    env.DB.prepare(`
      SELECT id,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at
      FROM local_region_operator_events
      WHERE region_id=?
      ORDER BY event_at DESC,id DESC
      LIMIT 20
    `).bind(region.id).all(),
  ]);
  const assignments=(assignmentRows.results||[]).map(row=>publicAssignment(region,directory,row));
  const activeAssignments=assignments.filter(item=>item.status==='active'||item.status==='handover');
  const activeOperatorIds=[...new Set(activeAssignments.map(item=>item.operatorId))];
  return {
    region:{id:region.id,slug:region.publicSlug,name:region.name,brand:region.brand},
    modules:region.modules.map(item=>({id:item.id,label:item.label})),
    governance:{
      ownership:region.ownership,
      model:region.governanceModel,
      dataMovement:region.transferPolicy.dataMovement,
      preserveAuditHistory:Boolean(region.transferPolicy.preserveAuditHistory),
      allowPerModuleTransfer:Boolean(region.transferPolicy.allowPerModuleTransfer),
      allowCoOperation:Boolean(region.transferPolicy.allowCoOperation),
      overlapHandover:Boolean(region.transferPolicy.overlapHandover),
    },
    summary:{
      activeOperators:activeOperatorIds.length,
      moduleCount:region.modules.length,
      activeAssignmentCount:activeAssignments.length,
      leadAssignmentCount:activeAssignments.filter(item=>item.role==='lead_operator').length,
      handoverCount:activeAssignments.filter(item=>item.status==='handover').length,
    },
    operators:directoryRows.map(publicOperator),
    assignments,
    history:(eventRows.results||[]).map(row=>publicEvent(region,directory,row)),
    access:{
      email:access.email||'',
      role:access.role||'',
      principalType:access.principalType||'',
      delegatedOperator:access.delegatedOperator||null,
      canManageOperatingRights:canManageOperatingRights(access),
    },
  };
}


const PROJECT_ID=/^[a-z0-9][a-z0-9-]{0,63}$/;
const PROJECT_CATEGORIES=new Set(['administration','research','field','participation','campus','forest','commerce','media']);
const PROJECT_STATUSES=new Set(['completed','in_progress','planned','waiting']);
const PROJECT_VISIBILITIES=new Set(['public','private','archived']);
function boundedText(value,max=500){return String(value??'').trim().slice(0,max)}
function safeJsonArray(raw){try{const value=JSON.parse(String(raw||'[]'));return Array.isArray(value)?value:[]}catch{return[]}}
function cleanOrganizations(value){
  if(!Array.isArray(value))return[];
  return value.map(item=>boundedText(item,120)).filter(Boolean).slice(0,20);
}
function cleanEvidence(value){
  if(!Array.isArray(value))return[];
  return value.slice(0,12).map(item=>({
    type:boundedText(item?.type||'document',40),
    label:boundedText(item?.label||item?.type||'근거자료',120),
    url:boundedText(item?.url||'',600),
  })).filter(item=>item.label);
}
function projectRecord(row,{admin=false}={}){
  return {
    id:Number(row.id),
    occurredOn:row.occurred_on,
    title:row.title,
    category:row.category,
    status:row.status,
    summary:row.summary||'',
    organizations:safeJsonArray(row.organizations_json),
    place:row.place||'',
    evidence:safeJsonArray(row.evidence_json),
    nextAction:row.next_action||'',
    ...(admin?{visibility:row.visibility,createdBy:row.created_by||'',createdAt:row.created_at,updatedAt:row.updated_at}:{}),
  };
}
function projectPayload(project,records,{admin=false}={}){
  return {
    project:{
      regionId:project.region_id,
      projectId:project.project_id,
      name:project.name,
      subtitle:project.subtitle||'',
      phase:project.phase||'',
      statusText:project.status_text||'',
      nextStep:project.next_step||'',
      publicPath:project.public_path||'',
      ...(admin?{adminPath:project.admin_path||'',updatedAt:project.updated_at}:{}),
    },
    records:records.map(row=>projectRecord(row,{admin})),
  };
}
async function loadProject(env,regionId,projectId){
  return env.DB.prepare(`
    SELECT region_id,project_id,name,subtitle,phase,status_text,next_step,public_path,admin_path,created_at,updated_at
    FROM local_region_projects WHERE region_id=? AND project_id=? LIMIT 1
  `).bind(regionId,projectId).first();
}
async function loadProjectRecords(env,regionId,projectId,{admin=false}={}){
  const where=admin?'':'AND visibility=\'public\'';
  const rows=await env.DB.prepare(`
    SELECT id,region_id,project_id,occurred_on,title,category,status,summary,organizations_json,place,evidence_json,next_action,visibility,created_by,created_at,updated_at
    FROM local_region_project_records
    WHERE region_id=? AND project_id=? ${where}
    ORDER BY occurred_on DESC,id DESC
    LIMIT 300
  `).bind(regionId,projectId).all();
  return rows.results||[];
}
async function insertProjectEvent(env,{regionId,projectId,recordId=null,eventType,actorEmail='',payload={}}){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO local_region_project_events
    (event_key,region_id,project_id,record_id,event_type,actor_email,payload_json,event_at)
    VALUES(?,?,?,?,?,?,?,?)
  `).bind(
    ['project',regionId,projectId,eventType,Date.now(),crypto.randomUUID()].join(':'),
    regionId,projectId,recordId,eventType,actorEmail,JSON.stringify(payload||{}),now
  ).run();
}
function validProjectDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))}
function projectWriteFields(body){
  const occurredOn=boundedText(body.occurredOn,10);
  const title=boundedText(body.title,160);
  if(!validProjectDate(occurredOn)||!title)return null;
  return {
    occurredOn,
    title,
    category:PROJECT_CATEGORIES.has(clean(body.category))?clean(body.category):'administration',
    status:PROJECT_STATUSES.has(clean(body.status))?clean(body.status):'completed',
    summary:boundedText(body.summary,1200),
    organizations:cleanOrganizations(body.organizations),
    place:boundedText(body.place,240),
    evidence:cleanEvidence(body.evidence),
    nextAction:boundedText(body.nextAction,600),
    visibility:PROJECT_VISIBILITIES.has(clean(body.visibility))?clean(body.visibility):'public',
  };
}
async function handleLocalRegionProject(request,env,match){
  if(!env?.DB)return json(request,{error:'프로젝트 데이터베이스를 사용할 수 없습니다.',code:'LOCAL_REGION_PROJECT_DB_UNAVAILABLE'},503);
  const slug=clean(match[1]);
  const projectId=clean(match[2]);
  const subroute=clean(match[3]);
  const region=localRegionBySlug(slug);
  if(!region||!PROJECT_ID.test(projectId))return json(request,{error:'등록되지 않은 지역 프로젝트입니다.',code:'LOCAL_REGION_PROJECT_NOT_FOUND'},404);
  const project=await loadProject(env,region.id,projectId);
  if(!project)return json(request,{error:'등록되지 않은 지역 프로젝트입니다.',code:'LOCAL_REGION_PROJECT_NOT_FOUND'},404);

  if(request.method==='GET'&&!subroute){
    const records=await loadProjectRecords(env,region.id,projectId,{admin:false});
    return json(request,projectPayload(project,records));
  }

  const access=await resolveRegionalAccess(request,env,slug==='cheonggye'?'cheonggye-local':'');
  if(!access.ok)return json(request,{authenticated:false,error:'지역 프로젝트 운영권한이 없습니다.',code:access.code||'LOCAL_REGION_PROJECT_FORBIDDEN'},access.status||403);
  if(!canReadOperations(access))return json(request,{authenticated:true,error:'프로젝트 운영권한이 없습니다.',code:'LOCAL_REGION_PROJECT_FORBIDDEN'},403);

  if(request.method==='GET'&&subroute==='admin'){
    const records=await loadProjectRecords(env,region.id,projectId,{admin:true});
    return json(request,{...projectPayload(project,records,{admin:true}),access:{email:access.email||'',role:access.role||''}});
  }
  if(request.method!=='POST'||subroute!=='actions')return json(request,{error:'method_not_allowed'},405);
  if(!sameOriginForWrite(request))return json(request,{error:'허용되지 않은 요청 출처입니다.',code:'LOCAL_REGION_ORIGIN_FORBIDDEN'},403);

  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=='object')return json(request,{error:'요청 본문이 올바르지 않습니다.',code:'LOCAL_REGION_PROJECT_BODY_INVALID'},400);
  const action=clean(body.action);
  const now=new Date().toISOString();

  if(action==='update_project'){
    const phase=boundedText(body.phase,160);
    if(!phase)return json(request,{error:'현재 단계를 입력해야 합니다.',code:'LOCAL_REGION_PROJECT_PHASE_REQUIRED'},400);
    const statusText=boundedText(body.statusText,240);
    const nextStep=boundedText(body.nextStep,240);
    await env.DB.prepare(`
      UPDATE local_region_projects SET phase=?,status_text=?,next_step=?,updated_at=?
      WHERE region_id=? AND project_id=?
    `).bind(phase,statusText,nextStep,now,region.id,projectId).run();
    await insertProjectEvent(env,{regionId:region.id,projectId,eventType:'project_updated',actorEmail:access.email||'',payload:{phase,statusText,nextStep}});
    return json(request,{ok:true,action,updatedAt:now});
  }

  if(action==='create_record'){
    const fields=projectWriteFields(body);
    if(!fields)return json(request,{error:'날짜와 제목을 확인해 주세요.',code:'LOCAL_REGION_PROJECT_RECORD_INVALID'},400);
    const result=await env.DB.prepare(`
      INSERT INTO local_region_project_records
      (region_id,project_id,occurred_on,title,category,status,summary,organizations_json,place,evidence_json,next_action,visibility,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      region.id,projectId,fields.occurredOn,fields.title,fields.category,fields.status,fields.summary,
      JSON.stringify(fields.organizations),fields.place,JSON.stringify(fields.evidence),fields.nextAction,fields.visibility,
      access.email||'',now,now
    ).run();
    const recordId=Number(result?.meta?.last_row_id||0)||null;
    await insertProjectEvent(env,{regionId:region.id,projectId,recordId,eventType:'record_created',actorEmail:access.email||'',payload:{occurredOn:fields.occurredOn,title:fields.title,visibility:fields.visibility}});
    return json(request,{ok:true,action,recordId,updatedAt:now},201);
  }

  const recordId=Number(body.recordId||0);
  if(!Number.isInteger(recordId)||recordId<1)return json(request,{error:'이력 ID가 올바르지 않습니다.',code:'LOCAL_REGION_PROJECT_RECORD_ID_INVALID'},400);
  const current=await env.DB.prepare(`
    SELECT id,visibility FROM local_region_project_records
    WHERE id=? AND region_id=? AND project_id=? LIMIT 1
  `).bind(recordId,region.id,projectId).first();
  if(!current)return json(request,{error:'이력을 찾을 수 없습니다.',code:'LOCAL_REGION_PROJECT_RECORD_NOT_FOUND'},404);

  if(action==='update_record'){
    const fields=projectWriteFields(body);
    if(!fields)return json(request,{error:'날짜와 제목을 확인해 주세요.',code:'LOCAL_REGION_PROJECT_RECORD_INVALID'},400);
    await env.DB.prepare(`
      UPDATE local_region_project_records
      SET occurred_on=?,title=?,category=?,status=?,summary=?,organizations_json=?,place=?,evidence_json=?,next_action=?,visibility=?,updated_at=?
      WHERE id=? AND region_id=? AND project_id=?
    `).bind(
      fields.occurredOn,fields.title,fields.category,fields.status,fields.summary,JSON.stringify(fields.organizations),
      fields.place,JSON.stringify(fields.evidence),fields.nextAction,fields.visibility,now,recordId,region.id,projectId
    ).run();
    await insertProjectEvent(env,{regionId:region.id,projectId,recordId,eventType:'record_updated',actorEmail:access.email||'',payload:{occurredOn:fields.occurredOn,title:fields.title,visibility:fields.visibility}});
    return json(request,{ok:true,action,recordId,updatedAt:now});
  }

  if(action==='archive_record'){
    await env.DB.prepare(`
      UPDATE local_region_project_records SET visibility='archived',updated_at=?
      WHERE id=? AND region_id=? AND project_id=?
    `).bind(now,recordId,region.id,projectId).run();
    await insertProjectEvent(env,{regionId:region.id,projectId,recordId,eventType:'record_archived',actorEmail:access.email||'',payload:{previousVisibility:current.visibility}});
    return json(request,{ok:true,action,recordId,updatedAt:now});
  }

  return json(request,{error:'지원하지 않는 프로젝트 작업입니다.',code:'LOCAL_REGION_PROJECT_ACTION_UNKNOWN'},400);
}

export async function handleLocalRegionOperations(request,env){
  const url=new URL(request.url);
  const projectMatch=url.pathname.match(/^\/api\/local-operations\/([a-z0-9-]+)\/projects\/([a-z0-9-]+)(?:\/(admin|actions))?$/);
  if(projectMatch){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'https://ekodi.kr','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS','cache-control':'no-store'}});
    return handleLocalRegionProject(request,env,projectMatch);
  }
  const match=url.pathname.match(/^\/api\/local-operations\/([a-z0-9-]+)(?:\/(history|operators|actions))?$/);
  if(!match)return null;
  if(request.method==='OPTIONS'){
    return new Response(null,{status:204,headers:{
      'access-control-allow-origin':'https://ekodi.kr',
      'access-control-allow-headers':'authorization,content-type',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'cache-control':'no-store',
    }});
  }
  if(!env?.DB)return json(request,{error:'운영권 데이터베이스를 사용할 수 없습니다.',code:'LOCAL_REGION_OPERATIONS_DB_UNAVAILABLE'},503);

  const slug=clean(match[1]);
  const region=localRegionBySlug(slug);
  if(!region)return json(request,{error:'등록되지 않은 지역플랫폼입니다.',code:'LOCAL_REGION_NOT_FOUND'},404);
  const access=await resolveRegionalAccess(request,env,slug==='cheonggye'?'cheonggye-local':'');
  if(!access.ok)return json(request,{authenticated:false,error:'지역 운영관리 권한이 없습니다.',code:access.code||'LOCAL_REGION_OPERATIONS_FORBIDDEN'},access.status||403);
  if(!canReadOperations(access))return json(request,{authenticated:true,error:'운영권 조회 권한이 없습니다.',code:'LOCAL_REGION_OPERATIONS_FORBIDDEN'},403);

  const subroute=match[2]||'';
  if(request.method==='GET'){
    return json(request,await readPayload(env,region,access,{historyOnly:subroute==='history',operatorsOnly:subroute==='operators'}));
  }
  if(request.method!=='POST'||subroute!=='actions')return json(request,{error:'method_not_allowed'},405);
  if(!sameOriginForWrite(request))return json(request,{error:'허용되지 않은 요청 출처입니다.',code:'LOCAL_REGION_ORIGIN_FORBIDDEN'},403);
  if(!canManageOperatingRights(access))return json(request,{authenticated:true,error:'운영권 변경은 지역 권한관리자에게만 허용됩니다.',code:'LOCAL_REGION_GOVERNANCE_FORBIDDEN'},403);

  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=='object')return json(request,{error:'요청 본문이 올바르지 않습니다.',code:'LOCAL_REGION_ACTION_BODY_INVALID'},400);
  const action=clean(body.action);
  if(action==='register_operator')return registerOperator(request,env,region,access,body);
  return mutateAssignment(request,env,region,access,body);
}
