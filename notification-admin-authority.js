// Restricted, read-only notification metrics authority.
// Platform admin comes from the existing protected D1 session; tenant context
// comes ONLY from the verified Supabase user and its server-side RPC result.
import {handleAdminSessionFastPath} from './admin-session-fastpath.js';

const JWT_RE=/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const ADMIN_ROLES=new Set(['tenant_admin','workspace_admin','store_owner','owner','admin','client_admin','senior_pastor']);
// Do not infer cross-site ownership from a human-readable brand, URL, email,
// administrator title, or a browser-supplied site identifier.
// Both tenant slug and site_key originate in the authenticated server RPC.
// Confirmed current production registry pairs: church/church, mission/mission,
// cheonggye/cgma and ekodimall/mall. Do not infer topics from request paths.
const TENANT_TOPIC_BINDINGS=Object.freeze({
  'ekodi-church':Object.freeze({topic:'church',site:'church'}),
  'ekodichurch':Object.freeze({topic:'church',site:'church'}),
  'ekodimission':Object.freeze({topic:'mission',site:'mission'}),
  'cheonggye':Object.freeze({topic:'community',site:'cgma'}),
  'ekodimall':Object.freeze({topic:'mall',site:'mall'})
});
function bearer(request){
  const auth=String(request.headers.get('authorization')||'');
  return /^Bearer\s+(\S+)$/i.exec(auth)?.[1]||'';
}
async function platformSession(request,env){
  const url=new URL(request.url);
  url.pathname='/api/session';url.search='';
  const result=await handleAdminSessionFastPath(new Request(url,{method:'GET',
    headers:{authorization:request.headers.get('authorization')||''}}),env);
  if(!result?.ok)return false;
  const session=await result.json().catch(()=>null);
  return session?.authenticated===true&&session.role==='super_admin';
}
export async function notificationAdminAuthority(request,env,{transport=fetch}={}){
  const token=bearer(request);
  if(!token||token.length>4096)return null;
  if(await platformSession(request,env))return {kind:'platform',allowedTopics:null};
  if(!JWT_RE.test(token))return null;
  const url=String(env.MY_SUPABASE_URL||env.SUPABASE_URL||'');
  const key=String(env.MY_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||'');
  if(!url.startsWith('https://')||!key)return null;
  try{
    const headers={authorization:`Bearer ${token}`,apikey:key,'content-type':'application/json'};
    const [userResponse,contextResponse]=await Promise.all([
      transport(`${url}/auth/v1/user`,{method:'GET',headers,cache:'no-store'}),
      transport(`${url}/rest/v1/rpc/current_site_activity_contexts`,{
        method:'POST',headers,body:'{}',cache:'no-store'
      })
    ]);
    if(!userResponse.ok||!contextResponse.ok)return null;
    const [user,contexts]=await Promise.all([userResponse.json(),contextResponse.json()]);
    if(!user?.id||!user?.email||!user.email_confirmed_at||!Array.isArray(contexts))return null;
    const allowedTopics=new Set();
    for(const context of contexts){
      if(!context?.tenant_id||context.authority_scope!=='tenant'
        ||context.operating_model!=='customer-site'
        ||!ADMIN_ROLES.has(String(context.authorization_role||'').toLowerCase()))continue;
      const slug=String(context.tenant||'').trim().toLowerCase();
      const site=String(context.site||'').trim().toLowerCase();
      const binding=Object.hasOwn(TENANT_TOPIC_BINDINGS,slug)?TENANT_TOPIC_BINDINGS[slug]:null;
      if(binding?.site===site)allowedTopics.add(binding.topic);
    }
    return allowedTopics.size?{kind:'site',allowedTopics:[...allowedTopics]}:null;
  }catch{
    // No speculative fallback to role claims or plain JWT decoding.
    return null;
  }
}
