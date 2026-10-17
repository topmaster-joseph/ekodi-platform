import authWorker from './auth-worker.js';
import { principalFromAdminSession } from './ekodi-principal.js';
export const SHARE_PATH='/mokdaehumun/api/shares';
export function isMokdaehumunSharePath(path){return path===SHARE_PATH;}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow, noarchive'}});
export async function mokdaehumunShareResponse(request,env,{resolveSession=principalFromAdminSession}={}){
 if(!isMokdaehumunSharePath(new URL(request.url).pathname))return null;
 if(new URL(request.url).origin!=='https://ekodi.kr')return json({error:'invalid_origin'},403);
 if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
 if(!env.DB)return json({error:'storage_unavailable'},503);
 const {principal}=await resolveSession(request,env,authWorker);
 if(principal?.kind!=='admin'||!principal.email)return json({error:'authentication_required'},401);
 try{
 const admin=await env.DB.prepare('SELECT id FROM admins WHERE lower(trim(email))=?').bind(principal.email.toLowerCase()).first();
 if(!admin)return json({error:'forbidden'},403);
 const role=await env.DB.prepare("SELECT role FROM mokdaehumun_admin_roles WHERE admin_id=? AND role IN ('owner','manager')").bind(admin.id).first();
 if(!role)return json({error:'cooperative_access_denied'},403);
 if(request.method==='GET'){
 const rows=await env.DB.prepare('SELECT member_id,entry_type,SUM(amount_krw) AS total_krw FROM mokdaehumun_share_entries GROUP BY member_id,entry_type LIMIT 500').all();
 return json({ok:true,summary:rows.results||[]});
 }
 if(role.role!=='owner')return json({error:'owner_required'},403);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return json({error:'json_required'},415);
 const raw=await request.text();if(raw.length>2048)return json({error:'too_large'},413);
 let v;try{v=JSON.parse(raw)}catch{return json({error:'bad_json'},400)}
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['member_id','entry_type','amount_krw'].includes(k)))return json({error:'invalid_fields'},400);
 if(typeof v.member_id!=='string'||!/^[0-9a-f-]{36}$/i.test(v.member_id))return json({error:'invalid_member_id'},400);
 if(!['pledge','payment','refund','adjustment'].includes(v.entry_type))return json({error:'invalid_entry_type'},400);
 if(!Number.isSafeInteger(v.amount_krw)||v.amount_krw<0||v.amount_krw>1000000000000)return json({error:'invalid_amount'},400);
 const member=await env.DB.prepare('SELECT id FROM mokdaehumun_members WHERE id=?').bind(v.member_id).first();
 if(!member)return json({error:'member_not_found'},404);
 const id=crypto.randomUUID();
 await env.DB.batch([
 env.DB.prepare('INSERT INTO mokdaehumun_share_entries(id,member_id,entry_type,amount_krw,actor_id) VALUES(?,?,?,?,?)').bind(id,v.member_id,v.entry_type,v.amount_krw,admin.id),
 env.DB.prepare('INSERT INTO mokdaehumun_audit(id,actor_id,action,target_id) VALUES(?,?,?,?)').bind(crypto.randomUUID(),admin.id,'share.record',id)
 ]);
 return json({ok:true,id},201);
 }catch{return json({error:'storage_not_initialized'},503)}
}
