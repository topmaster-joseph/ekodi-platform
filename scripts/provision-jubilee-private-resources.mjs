// EKODI orchestrator-only private resource bootstrap. Never receives manuscripts,
// registers public routes, modifies an existing resource or authorizes publication.
import {appendFileSync} from 'node:fs';
export const PRIVATE_RESOURCES=Object.freeze({
  r2:'ekodi-publishing-private-editorial',
  d1:'ekodi-publishing-private-ingest',
});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function verifyJubileeProvisionRequest({approval,accountId,token}){
  if(approval!=='CREATE_EKODI_PRIVATE_PUBLISHING_RESOURCES')
    throw Error('PRIVATE_RESOURCE_APPROVAL_REQUIRED');
  if(!/^[a-f0-9]{32}$/i.test(accountId||'')||
     typeof token!=='string'||token.length<12)
    throw Error('PRIVATE_RESOURCE_CREDENTIALS_MISSING');
  return true;
}
export function matchPrivateD1(databases){
  if(!Array.isArray(databases))throw Error('PRIVATE_D1_LIST_INVALID');
  const exact=databases.filter(x=>x?.name===PRIVATE_RESOURCES.d1);
  if(exact.length>1)throw Error('PRIVATE_D1_DUPLICATE_NAME');
  if(!exact.length)return null;
  if(!uuid.test(exact[0].uuid||''))throw Error('PRIVATE_D1_UUID_INVALID');
  return exact[0].uuid;
}
async function cloudflare(method,path,body=null,allow404=false){
  const u='https://api.cloudflare.com/client/v4/accounts/'+
    encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)+'/'+path;
  let res;
  try{res=await fetch(u,{method,
    headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,
      Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(16000)});
  }catch{throw Error('PRIVATE_CLOUDFLARE_TRANSPORT_FAILURE_'+method);}
  if(allow404&&res.status===404)return null;
  if(!res.ok)throw Error('PRIVATE_CLOUDFLARE_API_FAILURE_'+method+'_'+res.status);
  let json;try{json=await res.json();}catch{throw Error('PRIVATE_CLOUDFLARE_JSON_INVALID');}
  if(json?.success!==true)throw Error('PRIVATE_CLOUDFLARE_API_REJECTED_'+method);
  return json;
}
async function findD1(){
  const result=await cloudflare('GET','d1/database?name='+PRIVATE_RESOURCES.d1+'&per_page=100');
  const i=result.result_info;
  if(i?.total_count>100)throw Error('PRIVATE_D1_INCOMPLETE_INVENTORY');
  return matchPrivateD1(result.result);
}
async function ensureD1(){
  const existing=await findD1();
  if(existing)return {id:existing,created:false};
  let id;
  try{
    const created=await cloudflare('POST','d1/database',{name:PRIVATE_RESOURCES.d1});
    id=created.result?.uuid;
    if(!uuid.test(id||''))throw Error('PRIVATE_D1_CREATE_UUID_INVALID');
  }catch(e){
    // A concurrent authorized run may already have created this exact resource.
    id=await findD1();
    if(!id)throw e;
  }
  if(await findD1()!==id)throw Error('PRIVATE_D1_READBACK_FAILED');
  return {id,created:true};
}
async function findR2(){
  const r=await cloudflare('GET','r2/buckets/'+PRIVATE_RESOURCES.r2,null,true);
  if(!r)return false;
  if(r.result?.name!==PRIVATE_RESOURCES.r2)throw Error('PRIVATE_R2_IDENTITY_MISMATCH');
  return true;
}
async function ensureR2(){
  if(await findR2())return {created:false};
  try{
    await cloudflare('POST','r2/buckets',{name:PRIVATE_RESOURCES.r2,locationHint:'apac'});
  }catch(e){if(!await findR2())throw e;}
  if(!await findR2())throw Error('PRIVATE_R2_READBACK_FAILED');
  return {created:true};
}
export async function provisionJubileeResources(){
  verifyJubileeProvisionRequest({
    approval:process.env.JUBILEE_PRIVATE_RESOURCE_APPROVAL,
    accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
    token:process.env.CLOUDFLARE_API_TOKEN,
  });
  if(!process.env.GITHUB_OUTPUT)throw Error('PROTECTED_GITHUB_ACTION_REQUIRED');
  const d1=await ensureD1();
  const r2=await ensureR2();
  appendFileSync(process.env.GITHUB_OUTPUT,'private_d1_id='+d1.id+'\n',
    {mode:0o600,encoding:'utf8'});
  console.log('PRIVATE_JUBILEE_D1_READY created='+d1.created);
  console.log('PRIVATE_JUBILEE_R2_READY created='+r2.created);
  console.log('PRIVATE_JUBILEE_PROVISION_NO_PUBLIC_ROUTES');
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/provision-jubilee-private-resources.mjs'))
  await provisionJubileeResources();
