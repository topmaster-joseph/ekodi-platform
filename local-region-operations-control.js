import { localRegionBySlug } from './local-region-registry.js';
import { resolveRegionalAccess } from './regional-access-control.js';
import { TENANT_ADMIN_CAPABILITIES } from './tenant-admin-policy.js';

const clean=value=>String(value||'').trim().toLowerCase();

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

function canReadOperations(access){
  const capabilities=new Set(access?.capabilities||[]);
  return Boolean(access?.ok)&&(access.platform||capabilities.has('*')||capabilities.has(TENANT_ADMIN_CAPABILITIES.operations));
}

function publicAssignment(region,row){
  const module=region.modules.find(item=>item.id===row.module_id);
  const operator=region.operators[row.operator_id];
  return {
    moduleId:row.module_id,
    moduleLabel:module?.label||row.module_id,
    operatorId:row.operator_id,
    operatorName:operator?.name||row.operator_id,
    operatorTenantSlug:row.operator_tenant_slug,
    role:row.role,
    status:row.status,
    effectiveFrom:row.effective_from,
    effectiveTo:row.effective_to||'',
    note:row.note||'',
    updatedAt:row.updated_at,
  };
}

function publicEvent(region,row){
  const module=region.modules.find(item=>item.id===row.module_id);
  const operator=region.operators[row.operator_id];
  return {
    id:Number(row.id),
    moduleId:row.module_id,
    moduleLabel:module?.label||row.module_id,
    operatorId:row.operator_id,
    operatorName:operator?.name||row.operator_id,
    eventType:row.event_type,
    fromRole:row.from_role||'',
    toRole:row.to_role||'',
    actorEmail:row.actor_email||'',
    reason:row.reason||'',
    eventAt:row.event_at,
  };
}

export async function handleLocalRegionOperations(request,env){
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/api\/local-operations\/([a-z0-9-]+)(?:\/(history))?$/);
  if(!match)return null;
  if(request.method==='OPTIONS'){
    return new Response(null,{status:204,headers:{
      'access-control-allow-origin':'https://ekodi.kr',
      'access-control-allow-headers':'authorization,content-type',
      'access-control-allow-methods':'GET,OPTIONS',
      'cache-control':'no-store',
    }});
  }
  if(request.method!=='GET')return json(request,{error:'method_not_allowed'},405);
  if(!env?.DB)return json(request,{error:'운영권 데이터베이스를 사용할 수 없습니다.',code:'LOCAL_REGION_OPERATIONS_DB_UNAVAILABLE'},503);

  const slug=clean(match[1]);
  const region=localRegionBySlug(slug);
  if(!region)return json(request,{error:'등록되지 않은 지역플랫폼입니다.',code:'LOCAL_REGION_NOT_FOUND'},404);

  const access=await resolveRegionalAccess(request,env,slug==='cheonggye'?'cheonggye-local':'');
  if(!access.ok)return json(request,{authenticated:false,error:'지역 운영관리 권한이 없습니다.',code:access.code||'LOCAL_REGION_OPERATIONS_FORBIDDEN'},access.status||403);
  if(!canReadOperations(access))return json(request,{authenticated:true,error:'운영권 조회 권한이 없습니다.',code:'LOCAL_REGION_OPERATIONS_FORBIDDEN'},403);

  const historyOnly=match[2]==='history';
  if(historyOnly){
    const rows=await env.DB.prepare(`
      SELECT id,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at
      FROM local_region_operator_events
      WHERE region_id=?
      ORDER BY event_at DESC,id DESC
      LIMIT 100
    `).bind(region.id).all();
    return json(request,{
      region:{id:region.id,slug:region.publicSlug,name:region.name,brand:region.brand},
      history:(rows.results||[]).map(row=>publicEvent(region,row)),
    });
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

  const assignments=(assignmentRows.results||[]).map(row=>publicAssignment(region,row));
  const activeAssignments=assignments.filter(item=>item.status==='active'||item.status==='handover');
  const activeOperatorIds=[...new Set(activeAssignments.map(item=>item.operatorId))];

  return json(request,{
    region:{id:region.id,slug:region.publicSlug,name:region.name,brand:region.brand},
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
    assignments,
    history:(eventRows.results||[]).map(row=>publicEvent(region,row)),
    access:{
      email:access.email||'',
      role:access.role||'',
      principalType:access.principalType||'',
      delegatedOperator:access.delegatedOperator||null,
    },
  });
}
