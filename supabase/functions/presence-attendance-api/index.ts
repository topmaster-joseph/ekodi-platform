// EKODI Presence: private administrator API for church and mission onsite attendance.
// Auth is verified against the current Supabase project; service key is never sent to clients.
const ALLOWED_ORIGINS = new Set(['https://ekodi.kr','https://www.ekodi.kr']);
const TENANTS = new Set(['ekodi-church','ekodimission']);
const ACTIONS = new Set(['open_session','register_person','observe','record_headcount','check_in','resolve','unlink','close_session']);
function headers(origin: string) {
  const h: Record<string,string> = {
    'access-control-allow-headers':'authorization,apikey,content-type',
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'vary':'Origin',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  };
  if(origin && ALLOWED_ORIGINS.has(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
function reply(body: unknown,status: number,origin: string) {
  return new Response(JSON.stringify(body),{status,headers:{...headers(origin),'content-type':'application/json; charset=utf-8'}});
}
function bearer(req: Request) {
  const v=req.headers.get('authorization')||'';
  return /^Bearer\s/i.test(v) ? v.slice(7).trim() : '';
}
async function identity(req: Request, url: string, publicKey: string) {
  const token=bearer(req);
  if(!token || token.length>8192) return null;
  const res=await fetch(`${url}/auth/v1/user`,{headers:{apikey:publicKey,authorization:`Bearer ${token}`},cache:'no-store'});
  if(!res.ok) return null;
  const user=await res.json().catch(()=>null);
  if(!user?.id || !user?.email_confirmed_at) return null;
  return {id:String(user.id)};
}
function statusForRpc(result: unknown,status: number) {
  const code=String((result as {code?:string})?.code||'');
  const message=String((result as {message?:string})?.message||'');
  if(code==='42501')return 403;
  if(code==='23505')return 409;
  if(code==='22023'||code==='22P02'||code==='P0002')return 422;
  if(status===404||code==='42883'||code==='42P01')return 503;
  if(message.includes('tenant_staff_required'))return 403;
  return 502;
}
Deno.serve(async (req:Request) => {
  const origin=req.headers.get('origin')||'';
  if(origin&&!ALLOWED_ORIGINS.has(origin)) return reply({error:'ORIGIN_NOT_ALLOWED'},403,origin);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:headers(origin)});
  if(!['GET','POST'].includes(req.method)) return reply({error:'METHOD_NOT_ALLOWED'},405,origin);
  const url=(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY')||'';
  if(!url||!serviceKey||!anonKey) return reply({error:'SERVER_NOT_CONFIGURED'},503,origin);
  let actor;
  try { actor=await identity(req,url,anonKey); }catch{return reply({error:'IDENTITY_UNAVAILABLE'},503,origin);}
  if(!actor) return reply({error:'AUTH_REQUIRED'},401,origin);
  const location=new URL(req.url);
  const tenant=location.searchParams.get('tenant')||'';
  if(!TENANTS.has(tenant)) return reply({error:'TENANT_NOT_ALLOWED'},404,origin);
  let name: string, payload:Record<string,unknown>;
  if(req.method==='GET') {
    name='presence_snapshot';
    payload={p_tenant_slug:tenant,p_actor:actor.id,p_session:location.searchParams.get('session_id')||null,p_search:location.searchParams.get('search')||null};
  } else {
    if(Number(req.headers.get('content-length')||0)>16384) return reply({error:'BODY_TOO_LARGE'},413,origin);
    const body=await req.json().catch(()=>null);
    if(!body || typeof body!=='object'||Array.isArray(body) ||!ACTIONS.has(body.action)
      ||typeof body.request_id!=='string' ||!/^\w{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(body.request_id)
      ||typeof body.data!=='object' ||body.data===null ||Array.isArray(body.data)) {
      return reply({error:'INVALID_BODY'},400,origin);
    }
    name='presence_apply';
    payload={p_tenant_slug:tenant,p_actor:actor.id,p_action:body.action,p_data:body.data,p_request_id:body.request_id};
  }
  let upstream;
  try {
    upstream=await fetch(`${url}/rest/v1/rpc/${name}`,{
      method:'POST',headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,'content-type':'application/json'},
      body:JSON.stringify(payload),cache:'no-store'
    });
  }catch {return reply({error:'DATABASE_UNAVAILABLE'},503,origin);}
  const response=await upstream.json().catch(()=>({code:'UPSTREAM_INVALID_RESPONSE'}));
  if(!upstream.ok) {
    const code=String(response?.code||'REQUEST_FAILED');
    // Avoid reflecting backend SQL messages or sensitive row details to browsers.
    return reply({error:code},statusForRpc(response,upstream.status),origin);
  }
  return reply(response,200,origin);
});