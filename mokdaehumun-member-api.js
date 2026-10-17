import authWorker from './auth-worker.js';
import { principalFromAdminSession } from './ekodi-principal.js';
const ROOT='/mokdaehumun/api/members';
export function isMokdaehumunApiPath(path){return path===ROOT;}
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow, noarchive','x-content-type-options':'nosniff'}});
export async function mokdaehumunApiResponse(request,env,{resolveSession=principalFromAdminSession}={}){
 const url=new URL(request.url);
 if(!isMokdaehumunApiPath(url.pathname))return null;
 if(url.origin!=='https://ekodi.kr')return reply({error:'canonical_host_required'},403);
 if(request.method!=='GET')return reply({error:'method_not_allowed'},405);
 if(!env.DB)return reply({error:'storage_unavailable'},503);
 const {principal}=await resolveSession(request,env,authWorker);
 if(principal?.kind!=='admin'||!principal.email)return reply({error:'authentication_required'},401);
 const admin=await env.DB.prepare('SELECT id FROM admins WHERE lower(trim(email))=?').bind(principal.email.toLowerCase()).first();
 if(!admin?.id)return reply({error:'forbidden'},403);
 // Dedicated cooperative role is mandatory, even for other EKODI administrators.
 const role=await env.DB.prepare('SELECT role FROM mokdaehumun_admin_roles WHERE admin_id=? AND role IN (\'owner\',\'manager\')').bind(admin.id).first().catch(()=>null);
 if(!role)return reply({error:'cooperative_access_denied'},403);
 try{
  const rows=await env.DB.prepare('SELECT id,name,status,joined_at,created_at FROM mokdaehumun_members ORDER BY created_at DESC LIMIT 100').all();
  return reply({ok:true,members:rows.results||[]});
 }catch{return reply({error:'storage_not_initialized'},503);}
}
