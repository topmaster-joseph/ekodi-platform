// EKODI points governance API. Authenticated by the canonical EKODI admin
// session in api-worker.js (super_admin only), fail-closed by default.
// - GET  /api/control/points/overview          read-only policy snapshot
// - GET  /api/control/points/governance        KPIs, anomalies, requests, audit
// - GET  /api/control/points/member-ledger     audited member history lookup
// - POST /api/control/points/requests          propose a policy change/adjustment
// - POST /api/control/points/requests/:id/decision   approve or reject
// - POST /api/control/points/requests/:id/cancel     requester withdraws
// - GET  /api/control/points/scan              run anomaly detectors; open
//                                              findings, pending evidence claims, adapters
// - POST /api/control/points/claims/:id/decision     approve/reject a member claim
// - POST /api/control/points/anomalies/:id/resolve   acknowledge/resolve a finding
// Writes never edit wallets directly: the database applies them as audited,
// concurrency-checked requests (economic ones need a second super-admin).
// Dedicated credentials are bound in Worker secrets, never passed to browsers.
const PREFIX='/api/control/points';
const PATH=PREFIX+'/overview';
const SOURCE_PROJECTS=Object.freeze({
  production:'renzehysxirjilvdxacv',
  development:'lxcxwbdwwojjkgybbqii',
});
const QUERIES=Object.freeze({
  sites:['ekodi_point_sites','site_id,display_name,enabled,daily_cap',200],
  rules:['ekodi_point_rules','site_id,rule_id,points,daily_cap,daily_events,min_active_seconds,enabled',1000],
  transfers:['ekodi_point_transfer_policies','from_site,to_site,numerator,denominator,daily_cap,enabled',300],
  campaigns:['ekodi_point_donation_campaigns','campaign_id,site_id,title,recipient_name,enabled,starts_at,ends_at',300],
});
const KINDS=new Set(['site','rule','transfer','campaign','adjustment','reversal','adapter']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITE=/^[a-z0-9_-]{2,64}$/;
const REQUEST_KEY=/^[A-Za-z0-9:_-]{8,120}$/;
// Database errors that are safe and useful to show to an operator.
const KNOWN_ERRORS=/^(ADMIN_[A-Z_]+|INVALID_ADMIN_[A-Z_]+(:[a-z_]+)?|UNKNOWN_ADMIN_FIELD|LOW_TRUST_RULE_LIMIT|SECOND_APPROVER_REQUIRED|ONLY_REQUESTER_MAY_CANCEL|POINT_[A-Z_]+|ALREADY_REVERSED|REVERSAL_[A-Z_]+|ADJUSTMENT_EXCEEDS_BALANCE|EVIDENCE_[A-Z_]+|INVALID_EVIDENCE_[A-Z_]+|ANOMALY_NOT_FOUND)$/;

function reply(data,status=200,sourceHeaders=new Headers()){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  for(const k of ['access-control-allow-origin','vary']){const v=sourceHeaders.get(k);if(v)headers.set(k,v);}
  return new Response(JSON.stringify(data),{status,headers});
}
function resolveSource(request,env){
  const source=String(env?.POINTS_SOURCE_ENV||'');
  const expected=SOURCE_PROJECTS[source];
  const key=env?.POINTS_SERVICE_ROLE_KEY;
  let origin='';
  try{
    const parsed=new URL(String(env?.POINTS_SUPABASE_URL||''));
    if(parsed.protocol==='https:'&&parsed.hostname===expected+'.supabase.co'&&!parsed.username&&!parsed.password&&parsed.pathname==='/'){
      origin=parsed.origin;
    }
  }catch{}
  // No production-to-development fallback. Both environment and known project
  // reference must be configured and intentionally enabled together.
  if(!expected||!origin||!key||!['production','development'].includes(source))return {error:'points_source_unavailable'};
  if(new URL(request.url).hostname==='ekodi.kr'&&source!=='production')return {error:'points_environment_mismatch'};
  return {origin,key};
}
function actorOf(session){
  const email=String(session?.email||'').trim().toLowerCase();
  if(!/^[^@\s]{1,64}@[^@\s]{1,190}$/.test(email))return '';
  return 'ekodi-admin:'+email;
}
async function rpc(src,name,args,requestFetch){
  const response=await requestFetch(src.origin+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{apikey:src.key,Authorization:'Bearer '+src.key,Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(8000),
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const message=String(body?.message||'').trim();
    const error=new Error(KNOWN_ERRORS.test(message)?message:'points_rpc_failed:'+response.status);
    error.known=KNOWN_ERRORS.test(message);
    throw error;
  }
  return body;
}
function rpcFailure(error,headers){
  if(error?.known)return reply({error:error.message},409,headers);
  console.error('points governance rpc unavailable',String(error?.message||'error').slice(0,120));
  return reply({error:'points_governance_unavailable'},503,headers);
}
async function readOverview(src,headers,requestFetch){
  try{
    const entries=await Promise.all(Object.entries(QUERIES).map(async([name,[table,fields,limit]])=>{
      const endpoint=new URL(src.origin+'/rest/v1/'+table);
      endpoint.searchParams.set('select',fields);
      endpoint.searchParams.set('limit',String(limit));
      const response=await requestFetch(endpoint.toString(),{
        method:'GET',headers:{apikey:src.key,Authorization:'Bearer '+src.key,Accept:'application/json'},
        redirect:'error',signal:AbortSignal.timeout(6000),
      });
      if(!response.ok)throw Error('points_table_query_failed:'+response.status);
      const rows=await response.json();
      if(!Array.isArray(rows))throw Error('invalid_points_response');
      return [name,rows];
    }));
    return reply({read_only:true,...Object.fromEntries(entries),snapshot_at:new Date().toISOString()},200,headers);
  }catch(error){
    console.error('points admin projection unavailable',String(error?.message||'error').slice(0,120));
    return reply({error:'points_governance_unavailable'},503,headers);
  }
}
async function readJson(request){
  const text=await request.text();
  if(text.length>8192)throw new Error('too_large');
  const body=JSON.parse(text||'{}');
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid');
  return body;
}

export async function handlePointsControl(request,env,session,headers=new Headers(),requestFetch=fetch){
  const url=new URL(request.url);
  const path=url.pathname;
  if(path!==PREFIX&&!path.startsWith(PREFIX+'/'))return null;
  const decision=path.match(/^\/api\/control\/points\/requests\/([^/]+)\/(decision|cancel)$/);
  const claimDecision=path.match(/^\/api\/control\/points\/claims\/([^/]+)\/decision$/);
  const anomalyResolve=path.match(/^\/api\/control\/points\/anomalies\/([^/]+)\/resolve$/);
  const known=path===PATH||path===PREFIX+'/governance'||path===PREFIX+'/member-ledger'||path===PREFIX+'/scan'
    ||path===PREFIX+'/requests'||decision||claimDecision||anomalyResolve;
  if(!known)return reply({error:'not_found'},404,headers);
  const isWrite=path===PREFIX+'/requests'||Boolean(decision||claimDecision||anomalyResolve);
  if(request.method!==(isWrite?'POST':'GET'))return reply({error:'method_not_allowed'},405,headers);
  if(session?.role!=='super_admin')return reply({error:'super_admin_required'},403,headers);
  if(env?.POINTS_POLICY_READ_ENABLED!=='true')return reply({error:'points_governance_not_active'},503,headers);

  if(path===PATH){
    const src=resolveSource(request,env);
    if(src.error)return reply({error:src.error},503,headers);
    return readOverview(src,headers,requestFetch);
  }

  const actor=actorOf(session);
  if(!actor)return reply({error:'admin_identity_required'},403,headers);
  if(isWrite){
    // Writes are a separate, default-off release switch, and must come from
    // the admin console's own origin (no cross-site form or script posts).
    if(env?.POINTS_POLICY_WRITE_ENABLED!=='true')return reply({error:'points_policy_write_not_active'},503,headers);
    if(request.headers.get('origin')!==url.origin)return reply({error:'same_origin_required'},403,headers);
    if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json')){
      return reply({error:'json_required'},415,headers);
    }
  }
  const src=resolveSource(request,env);
  if(src.error)return reply({error:src.error},503,headers);

  try{
    if(path===PREFIX+'/governance'){
      return reply({governance:await rpc(src,'ekodi_points_admin_overview',{p_actor:actor},requestFetch),snapshot_at:new Date().toISOString()},200,headers);
    }
    if(path===PREFIX+'/scan'){
      return reply({scan:await rpc(src,'ekodi_points_admin_scan',{p_actor:actor},requestFetch),snapshot_at:new Date().toISOString()},200,headers);
    }
    if(path===PREFIX+'/member-ledger'){
      const site=url.searchParams.get('site')||'';
      const person=url.searchParams.get('person')||'';
      if(!SITE.test(site)||!UUID.test(person))return reply({error:'invalid_member_lookup'},400,headers);
      const limit=Math.max(1,Math.min(200,Number(url.searchParams.get('limit')||50)||50));
      return reply(await rpc(src,'ekodi_points_admin_member_ledger',{p_actor:actor,p_site:site,p_person:person,p_limit:limit},requestFetch),200,headers);
    }
    let body;
    try{body=await readJson(request);}catch{return reply({error:'invalid_json'},400,headers);}
    if(path===PREFIX+'/requests'){
      const {kind,target,proposed,reason,request_key:requestKey}=body;
      if(!KINDS.has(kind)||!target||typeof target!=='object'||Array.isArray(target)
        ||!proposed||typeof proposed!=='object'||Array.isArray(proposed)
        ||typeof reason!=='string'||reason.trim().length<5||reason.length>500
        ||typeof requestKey!=='string'||!REQUEST_KEY.test(requestKey)){
        return reply({error:'invalid_points_request'},400,headers);
      }
      const result=kind==='adapter'
        ?await rpc(src,'ekodi_points_admin_propose_adapter',{
          p_actor:actor,p_target:target,p_proposed:proposed,p_reason:reason.trim(),p_request_key:requestKey,
        },requestFetch)
        :await rpc(src,'ekodi_points_admin_propose',{
          p_actor:actor,p_kind:kind,p_target:target,p_proposed:proposed,p_reason:reason.trim(),p_request_key:requestKey,
        },requestFetch);
      return reply(result,result?.replayed?200:201,headers);
    }
    const note=body.note??null;
    if(note!==null&&(typeof note!=='string'||note.length>500))return reply({error:'invalid_decision'},400,headers);
    if(claimDecision){
      if(!UUID.test(claimDecision[1])||typeof body.approve!=='boolean')return reply({error:'invalid_decision'},400,headers);
      return reply(await rpc(src,'ekodi_points_admin_decide_claim',{p_actor:actor,p_claim:claimDecision[1],p_approve:body.approve,p_note:note},requestFetch),200,headers);
    }
    if(anomalyResolve){
      if(!/^[1-9][0-9]{0,17}$/.test(anomalyResolve[1])||!['acknowledged','resolved'].includes(body.status)){
        return reply({error:'invalid_decision'},400,headers);
      }
      return reply(await rpc(src,'ekodi_points_admin_resolve_anomaly',{p_actor:actor,p_anomaly:Number(anomalyResolve[1]),p_status:body.status,p_note:note},requestFetch),200,headers);
    }
    const requestId=decision[1];
    if(!UUID.test(requestId))return reply({error:'invalid_request_id'},400,headers);
    if(decision[2]==='cancel'){
      return reply(await rpc(src,'ekodi_points_admin_cancel',{p_actor:actor,p_request_id:requestId},requestFetch),200,headers);
    }
    if(typeof body.approve!=='boolean'||(body.note!=null&&(typeof body.note!=='string'||body.note.length>500))){
      return reply({error:'invalid_decision'},400,headers);
    }
    return reply(await rpc(src,'ekodi_points_admin_decide',{
      p_actor:actor,p_request_id:requestId,p_approve:body.approve,p_note:body.note??null,
    },requestFetch),200,headers);
  }catch(error){
    return rpcFailure(error,headers);
  }
}
