const PREFIX='/api/insurance/admin';
const APPROVED_BACKENDS=new Set(['https://insurance-api-staging.ekodi.kr','https://insurance-api.ekodi.kr']);

function json(data,status=200,sourceHeaders=null){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  for(const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-max-age','vary']){
    const value=sourceHeaders?.get?.(name);if(value)headers.set(name,value);
  }
  return new Response(JSON.stringify(data),{status,headers});
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
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
  if(pathname===`${PREFIX}/consultations`)return'/api/internal/consultations';
  const detail=pathname.match(/^\/api\/insurance\/admin\/consultations\/(con_[a-f0-9-]+)$/i);if(detail)return`/api/internal/consultations/${detail[1]}`;
  const status=pathname.match(/^\/api\/insurance\/admin\/consultations\/(con_[a-f0-9-]+)\/status$/i);if(status)return`/api/internal/consultations/${status[1]}/status`;
  return'';
}
function adminStatusToApi(value){return value==='working'?'reviewing':value}
function apiStatusToAdmin(value){return value==='reviewing'?'working':value}
function normalizeResponse(data){
  if(Array.isArray(data?.consultations))data.consultations=data.consultations.map(item=>({...item,status:apiStatusToAdmin(item.status)}));
  if(data?.consultation?.status)data.consultation.status=apiStatusToAdmin(data.consultation.status);
  if(data?.status)data.status=apiStatusToAdmin(data.status);
  return data;
}
async function fetchInternal(base,path,init){
  const attempts=base==='https://insurance-api-staging.ekodi.kr'?8:1;
  let response;
  for(let attempt=1;attempt<=attempts;attempt+=1){
    response=await fetch(`${base}${path}`,init);
    if(response.status!==401||attempt===attempts)return response;
    try{await response.body?.cancel?.();}catch{}
    await sleep(750*attempt);
  }
  return response;
}
export async function handleInsuranceAdminProxy(request,env,ctx,apiWorker){
  if(request.method==='OPTIONS')return apiWorker.fetch(request,env,ctx);
  const auth=await centralSession(request,env,ctx,apiWorker);if(!auth.session)return auth.response;
  const upstreamPath=mapPath(new URL(request.url).pathname);if(!upstreamPath)return json({error:'insurance_admin_endpoint_not_found'},404,auth.response.headers);
  if(!['GET','PATCH'].includes(request.method))return json({error:'method_not_allowed'},405,auth.response.headers);
  const base=String(env.INSURANCE_API_BASE||'').replace(/\/$/,'');
  const internalToken=String(env.INSURANCE_INTERNAL_TOKEN||'');
  if(!base||!internalToken)return json({error:'insurance_admin_proxy_not_configured'},503,auth.response.headers);
  if(!APPROVED_BACKENDS.has(base))return json({error:'unapproved_insurance_backend'},503,auth.response.headers);
  const headers=new Headers({'content-type':'application/json','x-ekodi-insurance-internal-token':internalToken,'x-ekodi-actor':String(auth.session.email).toLowerCase()});
  let body;
  if(request.method==='PATCH'){
    const input=await request.json().catch(()=>({}));
    body=JSON.stringify({...input,status:adminStatusToApi(input.status)});
  }
  const upstream=await fetchInternal(base,upstreamPath,{method:request.method,headers,body,cache:'no-store'});
  const text=await upstream.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:'insurance_backend_invalid_response'}};
  return json(normalizeResponse(data),upstream.status,auth.response.headers);
}

export const INSURANCE_ADMIN_PREFIX=PREFIX;
