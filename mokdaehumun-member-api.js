import authWorker from './auth-worker.js';
import { principalFromAdminSession } from './ekodi-principal.js';
const ROOT='/mokdaehumun/api/members';
export function isMokdaehumunApiPath(path){return path===ROOT;}
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow, noarchive','x-content-type-options':'nosniff'}});
export async function mokdaehumunApiResponse(request,env,{resolveSession=principalFromAdminSession}={}){
 const url=new URL(request.url);
 if(!isMokdaehumunApiPath(url.pathname))return null;
 if(url.origin!=='https://ekodi.kr')return reply({error:'canonical_host_required'},403);
 if(!['GET','POST','PATCH'].includes(request.method))return reply({error:'method_not_allowed'},405);
 if(!env.DB)return reply({error:'storage_unavailable'},503);
 const {principal}=await resolveSession(request,env,authWorker);
 if(principal?.kind!=='admin'||!principal.email)return reply({error:'authentication_required'},401);
 const admin=await env.DB.prepare('SELECT id FROM admins WHERE lower(trim(email))=?').bind(principal.email.toLowerCase()).first();
 if(!admin?.id)return reply({error:'forbidden'},403);
 // Dedicated cooperative role is mandatory, even for other EKODI administrators.
 const role=await env.DB.prepare('SELECT role FROM mokdaehumun_admin_roles WHERE admin_id=? AND role IN (\'owner\',\'manager\')').bind(admin.id).first().catch(()=>null);
 if(!role)return reply({error:'cooperative_access_denied'},403);
 try{
  if(request.method==='POST'){
   if(role.role!=='owner')return reply({error:'owner_required'},403);
   if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply({error:'json_required'},415);
   const raw=await request.text();
   if(raw.length>2048)return reply({error:'too_large'},413);
   let payload;try{payload=JSON.parse(raw)}catch{return reply({error:'bad_json'},400)}
   if(!payload||typeof payload.name!=='string'||payload.name.trim().length<1||payload.name.length>80||Object.keys(payload).some(k=>k!=='name'))return reply({error:'invalid_member'},400);
   const id=crypto.randomUUID();
   await env.DB.batch([
    env.DB.prepare('INSERT INTO mokdaehumun_members(id,name) VALUES(?,?)').bind(id,payload.name.trim()),
    env.DB.prepare('INSERT INTO mokdaehumun_audit(id,actor_id,action,target_id) VALUES(?,?,?,?)').bind(crypto.randomUUID(),admin.id,'member.create',id)
   ]);
   return reply({ok:true,id},201);
  }
  if(request.method==='PATCH'){
   if(role.role!=='owner')return reply({error:'owner_required'},403);
   if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply({error:'json_required'},415);
   const raw=await request.text();
   if(raw.length>2048)return reply({error:'too_large'},413);
   let payload;try{payload=JSON.parse(raw)}catch{return reply({error:'bad_json'},400)}
   if(!payload||typeof payload!=='object'||Array.isArray(payload))return reply({error:'invalid_member'},400);
   if(Object.keys(payload).some(k=>!['id','name','status'].includes(k)))return reply({error:'invalid_fields'},400);
   if(typeof payload.id!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.id))return reply({error:'invalid_id'},400);
   if(payload.name!==undefined&&(typeof payload.name!=='string'||!payload.name.trim()||payload.name.length>80))return reply({error:'invalid_name'},400);
   if(payload.status!==undefined&&!['active','inactive','withdrawn'].includes(payload.status))return reply({error:'invalid_status'},400);
   if(payload.name===undefined&&payload.status===undefined)return reply({error:'no_changes'},400);
   const existing=await env.DB.prepare('SELECT id FROM mokdaehumun_members WHERE id=?').bind(payload.id).first();
   if(!existing)return reply({error:'not_found'},404);
   await env.DB.batch([
    env.DB.prepare('UPDATE mokdaehumun_members SET name=COALESCE(?,name),status=COALESCE(?,status),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(payload.name?.trim()||null,payload.status||null,payload.id),
    env.DB.prepare('INSERT INTO mokdaehumun_audit(id,actor_id,action,target_id) VALUES(?,?,?,?)').bind(crypto.randomUUID(),admin.id,'member.update',payload.id)
   ]);
   return reply({ok:true});
  }
  const rows=await env.DB.prepare('SELECT id,name,status,joined_at,created_at FROM mokdaehumun_members ORDER BY created_at DESC LIMIT 100').all();
  return reply({ok:true,members:rows.results||[]});
 }catch{return reply({error:'storage_not_initialized'},503);}
}
