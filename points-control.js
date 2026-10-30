// EKODI points governance projection. Strictly read-only, fail-closed and
// authenticated by the canonical EKODI admin session in api-worker.js.
// Dedicated credentials are bound in Worker secrets, never passed to browsers.
const PATH='/api/control/points/overview';
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
function reply(data,status=200,sourceHeaders=new Headers()){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  for(const k of ['access-control-allow-origin','vary']){const v=sourceHeaders.get(k);if(v)headers.set(k,v);}
  return new Response(JSON.stringify(data),{status,headers});
}
export async function handlePointsControl(request,env,session,headers=new Headers(),requestFetch=fetch){
  if(new URL(request.url).pathname!==PATH)return null;
  if(request.method!=='GET')return reply({error:'method_not_allowed'},405,headers);
  if(session?.role!=='super_admin')return reply({error:'super_admin_required'},403,headers);
  if(env?.POINTS_POLICY_READ_ENABLED!=='true')return reply({error:'points_governance_not_active'},503,headers);

  const source=String(env.POINTS_SOURCE_ENV||'');
  const expected=SOURCE_PROJECTS[source];
  const key=env.POINTS_SERVICE_ROLE_KEY;
  const supplied=String(env.POINTS_SUPABASE_URL||'');
  let origin='';
  try{
    const parsed=new URL(supplied);
    if(parsed.protocol==='https:'&&parsed.hostname===expected+'.supabase.co'&&!parsed.username&&!parsed.password&&parsed.pathname==='/'){
      origin=parsed.origin;
    }
  }catch{}
  // No production-to-development fallback. Both environment and known project
  // reference must be configured and intentionally enabled together.
  if(!expected||!origin||!key||!['production','development'].includes(source)){
    return reply({error:'points_source_unavailable'},503,headers);
  }
  if(new URL(request.url).hostname==='ekodi.kr'&&source!=='production'){
    return reply({error:'points_environment_mismatch'},503,headers);
  }
  try{
    const entries=await Promise.all(Object.entries(QUERIES).map(async([name,[table,fields,limit]])=>{
      const endpoint=new URL(origin+'/rest/v1/'+table);
      endpoint.searchParams.set('select',fields);
      endpoint.searchParams.set('limit',String(limit));
      const response=await requestFetch(endpoint.toString(),{
        method:'GET',headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'},
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
