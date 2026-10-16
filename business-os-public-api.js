import {BUSINESS_OS_CORE_VERSION,BUSINESS_OS_LOOP,BUSINESS_OS_STAGE,businessOsBudget,businessOsGate} from './business-os-core.js';
const ROOT='/ekodibiz/business-os';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export function isBusinessOsCommonPath(path){return path===ROOT+'/capabilities'||path===ROOT+'/estimate'||path===ROOT+'/action-policy'}
export async function businessOsCommonResponse(request){
 const url=new URL(request.url),path=url.pathname;
 if(!isBusinessOsCommonPath(path))return null;
 if(path===ROOT+'/capabilities'){
  if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'method_not_allowed'},405);
  return json({version:BUSINESS_OS_CORE_VERSION,workflow:BUSINESS_OS_LOOP,stages:BUSINESS_OS_STAGE,mode:'stateless_public_capability',persistentData:false});
 }
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(Number(request.headers.get('content-length')||0)>4096)return json({error:'payload_too_large'},413);
 let input;try{input=await request.json()}catch{return json({error:'invalid_json'},400)}
 if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'invalid_input'},400);
 if(path===ROOT+'/action-policy'){
  const action=String(input.action||'').slice(0,128);
  return json({...businessOsGate(action),executable:false});
 }
 const supported=['houses','sqm','yieldKg','acceptance','unitPrice','capex','supplies','labor','transport','cycles'];
 if(supported.some(key=>typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<0))return json({error:'invalid_budget_values',required:supported},400);
 if(input.cycles<1)return json({error:'invalid_cycles'},400);
 return json(businessOsBudget(input));
}
