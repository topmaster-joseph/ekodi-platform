const PREFIX='/api/insurance/admin';

function json(data,status=200,sourceHeaders=null){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  for(const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-max-age','vary']){
    const value=sourceHeaders?.get?.(name);if(value)headers.set(name,value);
  }
  return new Response(JSON.stringify(data),{status,headers});
}
async function centralSession(request,env,ctx,apiWorker){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const sessionRequest=new Request(url.toString(),{method:'GET',headers:request.headers});
  const response=await apiWorker.fetch(sessionRequest,env,ctx);
  if(!response.ok)return{response};
  const session=await response.clone().json();
  if(!session?.email)return{response:json({error:'admin_session_required'},401,response.headers)};
  return{response,session};
}
function mapPath(pathname){
  if(pathname===`${PREFIX}/consultations`)return'/admin/consultations';
  const detail=pathname.match(/^\/api\/insurance\/admin\/consultations\/([0-9a-f-]+)$/i);if(detail)return`/admin/consultations/${detail[1]}`;
  const status=pathname.match(/^\/api\/insurance\/admin\/consultations\/([0-9a-f-]+)\/status$/i);if(status)return`/admin/consultations/${status[1]}/status`;
  return'';
}
export async function handleInsuranceAdminProxy(request,env,ctx,apiWorker){
  if(request.method==='OPTIONS')return apiWorker.fetch(request,env,ctx);
  const auth=await centralSession(request,env,ctx,apiWorker);if(!auth.session)return auth.response;
  const upstreamPath=mapPath(new URL(request.url).pathname);if(!upstreamPath)return json({error:'insurance_admin_endpoint_not_found'},404,auth.response.headers);
  if(!['GET','PATCH'].includes(request.method))return json({error:'method_not_allowed'},405,auth.response.headers);
  const base=String(env.INSURANCE_API_BASE||'').replace(/\/$/,'');
  const internalToken=String(env.INSURANCE_INTERNAL_TOKEN||'');
  const publishableKey=String(env.INSURANCE_API_PUBLISHABLE_KEY||'');
  if(!base||!internalToken||!publishableKey)return json({error:'insurance_admin_proxy_not_configured'},503,auth.response.headers);
  if(base.includes('renzehysxirjilvdxacv'))return json({error:'production_insurance_backend_blocked'},503,auth.response.headers);
  const headers=new Headers({'content-type':'application/json','apikey':publishableKey,'x-ekodi-internal-token':internalToken,'x-ekodi-actor':String(auth.session.email).toLowerCase(),'x-ekodi-role':'admin','origin':'https://api.ekodi.kr'});
  let body; if(request.method==='PATCH')body=await request.text();
  const upstream=await fetch(`${base}/functions/v1/insurance-api${upstreamPath}`,{method:request.method,headers,body,cache:'no-store'});
  const text=await upstream.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:'insurance_backend_invalid_response'}};
  return json(data,upstream.status,auth.response.headers);
}

export const INSURANCE_ADMIN_PREFIX=PREFIX;
