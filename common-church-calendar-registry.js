import SEED from './config/church-calendar/2026.json' with {type:'json'};

const PUBLIC_PATH='/api/public/church-calendar';
const ADMIN_PATH='/api/admin/church-calendar';
const AUTH_URL='https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api?scope=worship-access';
const ALLOWED_CATEGORIES=new Set(['liturgical','denominational','local']);
const SOURCE='EKODI common church calendar registry';

function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
  const d=new Date(value+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
const trim=(value,max)=>String(value??'').trim().slice(0,max);
function json(payload,status=200,privateResponse=false){
  return new Response(JSON.stringify(payload),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':privateResponse?'no-store':'public,max-age=60,s-maxage=120',
    'x-content-type-options':'nosniff',
    'x-ekodi-source-of-truth':'common-church-calendar'
  }});
}
const asEvent=e=>({
  id:e.id,date:e.date||e.event_date,endDate:e.endDate||e.end_date,name:e.name,
  category:e.category,approval:e.approval,bulletin:e.bulletin||'',
  sermonFocus:e.sermonFocus??e.sermon_focus??'',sourceUrl:e.sourceUrl??e.source_url??SEED.source,
  sourceNote:e.sourceNote??e.source_note??'',updatedAt:e.updated_at??null,
  source:e.source??(e.updated_by?'admin':'pck-2026-reference')
});
export const CHURCH_CALENDAR_SEED=Object.freeze(SEED.events.map(asEvent));
export function eventsOnDate(date,events=CHURCH_CALENDAR_SEED){
  if(!validDate(date))return [];
  return events.filter(e=>e.approval!=='archived'&&e.date<=date&&e.endDate>=date);
}
export function churchCalendarSource(){return {denomination:SEED.denomination,sourceUrl:SEED.source,referenceUrl:SEED.reference_page,notes:SEED.notes};}
function mergedEvents(rows){
  const byId=new Map(CHURCH_CALENDAR_SEED.map(e=>[e.id,e]));
  for(const row of rows)byId.set(row.id,asEvent(row));
  return [...byId.values()].filter(e=>e.approval!=='archived').sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ko'));
}
async function overrides(db){
  if(!db)return [];
  try{const result=await db.prepare('SELECT * FROM common_church_calendar_entries').all();return result.results||[]}
  catch(e){if(/no such table/i.test(String(e)))return [];throw e;}
}
async function allowed(request,deps={}){
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return false;
  const auth=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(auth)||auth.length>8192)return false;
  try{
    const rsp=await (deps.fetch||fetch)(AUTH_URL,{headers:{authorization:auth,accept:'application/json'},redirect:'error'});
    if(!rsp.ok)return false;
    const result=await rsp.json();
    return result?.permissions?.worship===true;
  }catch{return false;}
}
function validated(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('INVALID_EVENT');
  const date=trim(input.date,10),endDate=trim(input.endDate||input.date,10);
  if(!validDate(date)||!validDate(endDate)||endDate<date||Date.parse(endDate+'T00:00:00Z')-Date.parse(date+'T00:00:00Z')>31*86400000)throw new Error('INVALID_DATE_RANGE');
  const name=trim(input.name,120),category=trim(input.category,20),approval=trim(input.approval,20);
  if(!name||!ALLOWED_CATEGORIES.has(category)||!['draft','approved'].includes(approval))throw new Error('INVALID_EVENT_FIELDS');
  const bulletin=trim(input.bulletin,900),sermonFocus=trim(input.sermonFocus,800),sourceUrl=trim(input.sourceUrl,800),sourceNote=trim(input.sourceNote,320);
  if(approval==='approved'&&!/^https:\/\//.test(sourceUrl))throw new Error('SOURCE_URL_REQUIRED');
  if(sourceUrl&&!/^https:\/\//.test(sourceUrl))throw new Error('INVALID_SOURCE_URL');
  return {date,endDate,name,category,approval,bulletin,sermonFocus,sourceUrl,sourceNote};
}
export function validateCalendarEntry(input){return validated(input)}
async function audit(db,id,operation,actor,payload){
  await db.prepare('INSERT INTO common_church_calendar_audit (event_id,operation,actor,payload) VALUES (?,?,?,?)').bind(id,operation,actor,JSON.stringify(payload)).run();
}
export async function handleCommonChurchCalendar(request,env={},deps={}){
  const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'');
  if(path!==PUBLIC_PATH&&path!==ADMIN_PATH)return null;
  const isAdmin=path===ADMIN_PATH;
  const method=request.method.toUpperCase();
  if(isAdmin&&!await allowed(request,deps))return json({ok:false,code:'AUTH_REQUIRED'},403,true);
  if(!isAdmin&&method!=='GET')return json({ok:false,code:'READ_ONLY'},405);
  if(isAdmin&&!['GET','POST','PUT','DELETE'].includes(method))return json({ok:false,code:'METHOD_NOT_ALLOWED'},405,true);
  try{
    if(method==='GET'){
      const all=mergedEvents(await overrides(env.DB));
      const date=url.searchParams.get('date')||'',year=url.searchParams.get('year')||'';
      if(date&&!validDate(date))return json({ok:false,code:'INVALID_DATE'},400,isAdmin);
      if(year&&!/^20\d{2}$/.test(year))return json({ok:false,code:'INVALID_YEAR'},400,isAdmin);
      const events=(date?eventsOnDate(date,all):year?all.filter(e=>e.date.slice(0,4)===year):all)
        .filter(e=>isAdmin||e.approval!=='draft');
      return json({ok:true,registry:'ekodi-common-church-calendar',year:year||null,date:date||null,events,source:churchCalendarSource()},200,isAdmin);
    }
    if(!env.DB)return json({ok:false,code:'D1_UNAVAILABLE'},503,true);
    if(!/application\/json/.test(request.headers.get('content-type')||''))return json({ok:false,code:'JSON_REQUIRED'},415,true);
    const length=Number(request.headers.get('content-length')||0);
    if(length>10000)return json({ok:false,code:'PAYLOAD_TOO_LARGE'},413,true);
    const input=await request.json();
    const id=method==='POST'?'local-'+crypto.randomUUID():trim(input.id,100);
    if(!/^[a-z][a-z0-9-]{5,99}$/.test(id))return json({ok:false,code:'INVALID_ID'},400,true);
    const actor='verified-church-worship-admin';
    if(method==='DELETE'){
      await env.DB.prepare("INSERT INTO common_church_calendar_entries (id,event_date,end_date,name,category,approval,updated_by) VALUES (?,?,?,?,?,'archived',?) ON CONFLICT(id) DO UPDATE SET approval='archived',updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by,version=version+1")
        .bind(id,'2026-01-01','2026-01-01','보관됨','local',actor).run();
      await audit(env.DB,id,'archive',actor,{id});
      return json({ok:true,id,archived:true},200,true);
    }
    const entry=validated(input);
    const current=await env.DB.prepare('SELECT version FROM common_church_calendar_entries WHERE id=?').bind(id).first();
    if(method==='PUT'&&!current&&!CHURCH_CALENDAR_SEED.some(e=>e.id===id))return json({ok:false,code:'NOT_FOUND'},404,true);
    if(method==='POST'&&current)return json({ok:false,code:'ALREADY_EXISTS'},409,true);
    await env.DB.prepare("INSERT INTO common_church_calendar_entries (id,event_date,end_date,name,category,approval,bulletin,sermon_focus,source_url,source_note,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET event_date=excluded.event_date,end_date=excluded.end_date,name=excluded.name,category=excluded.category,approval=excluded.approval,bulletin=excluded.bulletin,sermon_focus=excluded.sermon_focus,source_url=excluded.source_url,source_note=excluded.source_note,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP,version=version+1")
      .bind(id,entry.date,entry.endDate,entry.name,entry.category,entry.approval,entry.bulletin,entry.sermonFocus,entry.sourceUrl,entry.sourceNote,actor).run();
    await audit(env.DB,id,method==='PUT'?'update':'create',actor,entry);
    return json({ok:true,id,event:asEvent({...entry,id,source:'admin'})},200,true);
  }catch(error){
    if(/^INVALID_|SOURCE_URL_REQUIRED/.test(String(error?.message)))return json({ok:false,code:error.message},400,true);
    return json({ok:false,code:'CALENDAR_SOURCE_UNAVAILABLE'},503,true);
  }
}
