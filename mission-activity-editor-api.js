// Public Mission activity-copy editorial gateway. No participant or payment writes.
export const MISSION_ACTIVITY_EDITOR_PATH='/ekodimission/api/activities/editor';
const keyPattern=/^[a-z0-9][a-z0-9-]{2,79}$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const timePattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const isValidDate=value=>{
  if(!datePattern.test(value))return false;
  const parsed=new Date(value+'T00:00:00Z');
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
};
const fail=(respond,error,status)=>respond({ok:false,error},status);

export async function handleMissionActivityEditor(request,env,{respond,publicRpc}){
  if(!['GET','POST'].includes(request.method))return fail(respond,'method_not_allowed',405);
  if(env.DATA_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY){
    return fail(respond,'activity_editor_unavailable',503);
  }
  if(request.method==='GET'){
    const result=await publicRpc('mission_activity_page_public_snapshot',{p_workspace_slug:'ekodimission'});
    if(!result.ok||!result.data?.ok||!Array.isArray(result.data.items)){
      return fail(respond,'activity_editor_unavailable',503);
    }
    return respond({ok:true,items:result.data.items},200);
  }
  const origin=String(request.headers.get('origin')||'');
  const requestOrigin=new URL(request.url).origin;
  if(origin&&!['https://ekodi.kr',requestOrigin].includes(origin))return fail(respond,'origin_not_allowed',403);
  const authorization=String(request.headers.get('authorization')||'');
  if(!/^Bearer\s+\S+$/i.test(authorization))return fail(respond,'authentication_required',401);
  if(Number(request.headers.get('content-length')||0)>8192)return fail(respond,'payload_too_large',413);
  const raw=await request.text().catch(()=>null);
  if(raw===null)return fail(respond,'invalid_json',400);
  if(raw.length>8192)return fail(respond,'payload_too_large',413);
  let data;
  try{data=JSON.parse(raw)}catch{return fail(respond,'invalid_json',400)}
  if(!data||typeof data!=='object'||Array.isArray(data))return fail(respond,'invalid_payload',400);
  const {key,title,summary,venue,date,time,expectedRevision}=data;
  if(typeof key!=='string'||!keyPattern.test(key)||
    typeof title!=='string'||!title.trim()||title.length>140||
    typeof summary!=='string'||summary.length>1500||
    typeof venue!=='string'||venue.length>180||
    typeof date!=='string'||(date!==''&&!isValidDate(date))||
    typeof time!=='string'||(time!==''&&!timePattern.test(time))||
    (time!==''&&date==='')||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<0){
    return fail(respond,'invalid_activity_content',400);
  }
  if(/[\u0000-\u0008\u000B-\u001F\u007F]/.test(title+summary+venue)){
    return fail(respond,'invalid_activity_content',400);
  }
  try{
    const upstream=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/mission_activity_page_update',{
      method:'POST',
      headers:{
        apikey:env.SUPABASE_PUBLISHABLE_KEY,
        authorization,
        'content-type':'application/json',
        'cache-control':'no-store'
      },
      body:JSON.stringify({
        p_workspace_slug:'ekodimission',
        p_activity_key:key,
        p_title:title.trim(),
        p_summary:summary,
        p_venue:venue,
        p_event_date:date||null,
        p_event_time:time||null,
        p_expected_revision:expectedRevision
      })
    });
    const result=await upstream.json().catch(()=>({}));
    if(!upstream.ok){
      const detail=String(result?.message||result?.error||'');
      const schemaNotReady=String(result?.code||'')==='PGRST202'||/Could not find the function/i.test(detail);
      if(schemaNotReady)return fail(respond,'activity_editor_schema_not_ready',503);
      if(/ACTIVITY_EDIT_CONFLICT/.test(detail)||String(result?.code)==='23505')return fail(respond,'activity_edit_conflict',409);
      if(/ACTIVITY_EDIT_FORBIDDEN/.test(detail)||['401','403','42501'].includes(String(result?.code))||upstream.status===401||upstream.status===403){
        return fail(respond,'activity_edit_forbidden',403);
      }
      if(/ACTIVITY_EDIT_INVALID/.test(detail))return fail(respond,'invalid_activity_content',400);
      return fail(respond,'activity_editor_unavailable',503);
    }
    if(result?.ok!==true||!result.item||result.item.key!==key)return fail(respond,'activity_editor_unavailable',503);
    return respond({ok:true,item:result.item},200);
  }catch{
    return fail(respond,'activity_editor_unavailable',503);
  }
}
