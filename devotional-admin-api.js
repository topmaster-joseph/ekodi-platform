// Shared devotional editor: immutable canonical Scripture; privileged activity overrides only.
// Security boundary is the existing EKODI D1 admin session, NOT client-provided roles.
import { isDevotionDate } from './devotional-activities.js';

const string=(value,max=2000)=>typeof value==='string'?value.trim().slice(0,max):'';
const safeMedia=value=>{const v=string(value,400);return /^\/bible\/media\/[a-z0-9/_-]+\.(?:mp3|ogg|m4a|webm|png|jpg|jpeg|webp|svg)$/i.test(v)?v:'';};

const CHURCH_ADMIN_ROLES=new Set(['senior_pastor','pastor','worship_admin','staff','care_staff']);
const MISSION_ADMIN_ROLES=new Set(['tenant_admin','store_owner']);
const JWT_RE=/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

function bearer(request){
  const match=/^Bearer\s+(\S{20,4096})$/i.exec(request.headers.get('authorization')||'');
  return match?match[1]:'';
}
// Verified EKODI member (Supabase Auth). The token is checked by Supabase, never decoded locally.
export async function devotionMember(request,env){
  const token=bearer(request);
  if(!JWT_RE.test(token)||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return null;
  try{
    const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{authorization:`Bearer ${token}`,apikey:env.SUPABASE_PUBLISHABLE_KEY}});
    if(!response.ok)return null;
    const user=await response.json();
    if(!user?.id)return null;
    return {id:user.id,email:String(user.email||'').toLowerCase(),emailConfirmed:Boolean(user.email_confirmed_at||user.confirmed_at),token};
  }catch{return null}
}
async function superAdminByEmail(env,member){
  if(!env.DB||!member?.email||!member.emailConfirmed)return null;
  const row=await env.DB.prepare('SELECT email,role FROM admins WHERE lower(email)=? LIMIT 1').bind(member.email).first().catch(()=>null);
  return row?.role==='super_admin'?{email:row.email,role:row.role,via:'member'}:null;
}
async function memberRest(env,member,path,init={}){
  const response=await fetch(`${env.SUPABASE_URL}${path}`,{...init,headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${member.token}`,'content-type':'application/json',...(init.headers||{})}});
  if(!response.ok)return null;
  return response.json().catch(()=>null);
}
// Who is viewing: drives the devotion page admin menu. Read-only role discovery; every admin
// surface linked from the menu still enforces its own authorization.
export async function devotionViewer(request,env){
  const d1Admin=await devotionD1Session(request,env);
  const member=d1Admin?null:await devotionMember(request,env);
  const viewer={authenticated:Boolean(d1Admin||member),email:d1Admin?.email||member?.email||'',superAdmin:Boolean(d1Admin),churchAdmin:false,missionAdmin:false};
  if(!member)return viewer;
  const [superAdmin,staff,contexts]=await Promise.all([
    superAdminByEmail(env,member),
    memberRest(env,member,`/rest/v1/church_staff?church_slug=eq.ekodi-church&user_id=eq.${encodeURIComponent(member.id)}&active=eq.true&select=role&limit=1`).catch(()=>null),
    memberRest(env,member,'/rest/v1/rpc/current_site_activity_contexts',{method:'POST',body:'{}'}).catch(()=>null),
  ]);
  const list=Array.isArray(contexts)?contexts:[];
  viewer.superAdmin=Boolean(superAdmin);
  viewer.churchAdmin=(Array.isArray(staff)&&CHURCH_ADMIN_ROLES.has(String(staff[0]?.role||'')))
    ||list.some(item=>String(item?.site||'')==='church'&&String(item?.authorization_role||'')==='tenant_admin');
  viewer.missionAdmin=list.some(item=>String(item?.tenant||'').toLowerCase()==='ekodimission'&&MISSION_ADMIN_ROLES.has(String(item?.authorization_role||'').toLowerCase()));
  return viewer;
}

// Super administrator: an EKODI admin-console session (D1) or a verified member whose email is a
// D1 super_admin. Client-provided roles are never trusted.
export async function devotionAdminSession(request,env){
  const d1=await devotionD1Session(request,env);
  if(d1)return d1;
  return superAdminByEmail(env,await devotionMember(request,env));
}
async function devotionD1Session(request,env){
  const raw=request.headers.get('authorization')||'';
  const match=/^Bearer ([a-zA-Z0-9_.-]{20,256})$/.exec(raw);
  if(!match||JWT_RE.test(match[1])||!env.DB)return null;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(match[1])))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const row=await env.DB.prepare(`SELECT a.email,a.role FROM sessions s JOIN admins a ON a.id=s.admin_id
    WHERE s.token_hash=? AND s.expires_at>? LIMIT 1`).bind(hash,new Date().toISOString()).first().catch(()=>null);
  return row?.role==='super_admin'?{email:row.email,role:row.role}:null;
}
export async function devotionOverride(env,date){
  if(!env.DB)return null;
  const row=await env.DB.prepare('SELECT activities_json,status,revision,updated_at FROM devotion_activity_overrides WHERE date=? LIMIT 1').bind(date).first().catch(()=>null);
  if(!row)return null;
  try{return {...row,activities:JSON.parse(row.activities_json)}}catch{return null}
}
export function validateDevotionActivities(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const activities={
    theme:string(raw.theme,160),keyLine:string(raw.keyLine,500),
    poem:raw.poem?{title:string(raw.poem.title,160),lines:(Array.isArray(raw.poem.lines)?raw.poem.lines:[]).slice(0,30).map(t=>string(t,300)).filter(Boolean)}:null,
    song:raw.song?{title:string(raw.song.title,160),mood:string(raw.song.mood,160),
      verse:(Array.isArray(raw.song.verse)?raw.song.verse:[]).slice(0,24).map(t=>string(t,300)).filter(Boolean),
      refrain:(Array.isArray(raw.song.refrain)?raw.song.refrain:[]).slice(0,12).map(t=>string(t,300)).filter(Boolean),
      abc:string(raw.song.abc,6000),mrUrl:safeMedia(raw.song.mrUrl),mrTitle:string(raw.song.mrTitle,140)}:null,
    questions:(Array.isArray(raw.questions)?raw.questions:[]).slice(0,8).map(q=>({kind:string(q?.kind,40),text:string(q?.text,350)})).filter(q=>q.text),
    family:string(raw.family,800),action:string(raw.action,800),prayer:string(raw.prayer,800),
    illustration:raw.illustration?{src:safeMedia(raw.illustration.src),alt:string(raw.illustration.alt,240)}:null
  };
  if(!activities.theme||!activities.keyLine||!activities.questions.length||!activities.action||!activities.prayer)return null;
  if(activities.poem&&(!activities.poem.title||!activities.poem.lines.length))return null;
  if(activities.song&&(!activities.song.title||!activities.song.verse.length))return null;
  return activities;
}
export async function saveDevotionOverride(request,env,admin,resolveDevotion){
  if(!admin)return Response.json({ok:false,error:'admin_required'},{status:403,headers:{'cache-control':'no-store'}});
  if(!env.DB)return Response.json({ok:false,error:'storage_unavailable'},{status:503});
  let payload;
  try{if(Number(request.headers.get('content-length')||0)>30000)return Response.json({ok:false,error:'too_large'},{status:413});
    payload=await request.json();}catch{return Response.json({ok:false,error:'invalid_json'},{status:400})}
  const date=String(payload?.date||''),base=isDevotionDate(date)?resolveDevotion(date):null;
  if(!base?.found)return Response.json({ok:false,error:'unregistered_scripture'},{status:400});
  const activities=validateDevotionActivities(payload.activities);
  if(!activities)return Response.json({ok:false,error:'invalid_activities'},{status:400});
  const status=payload.status==='published'?'published':'draft';
  const expected=Number(payload.expectedRevision);
  if(!Number.isSafeInteger(expected)||expected<0)return Response.json({ok:false,error:'invalid_revision'},{status:400});
  const existing=await devotionOverride(env,date);
  if(expected!==Number(existing?.revision||0))return Response.json({ok:false,error:'revision_conflict',revision:existing?.revision||0},{status:409});
  const now=new Date().toISOString(),data=JSON.stringify(activities);
  let result;
  try{
    if(existing)result=await env.DB.prepare(`UPDATE devotion_activity_overrides
      SET activities_json=?,status=?,revision=revision+1,updated_by=?,updated_at=?
      WHERE date=? AND revision=?`).bind(data,status,admin.email,now,date,expected).run();
    else result=await env.DB.prepare(`INSERT OR IGNORE INTO devotion_activity_overrides
      (date,activities_json,status,revision,updated_by,updated_at) VALUES (?,?,?,1,?,?)`).bind(date,data,status,admin.email,now).run();
  }catch{return Response.json({ok:false,error:'storage_unavailable'},{status:503})}
  if((result?.meta?.changes||0)!==1)return Response.json({ok:false,error:'revision_conflict'},{status:409});
  return Response.json({ok:true,date,status,revision:expected+1,updatedAt:now},{headers:{'cache-control':'no-store'}});
}
