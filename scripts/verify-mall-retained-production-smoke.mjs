import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ORIGIN='https://ekodi.kr';
const REQUIRED_MALL=['EKODI MALL','ALL MARKET','LOCAL COMMONS','SELLER STUDIO'];
const REQUIRED_ADMIN_ASSET=['channel-workbench','channelAccountForm','data-account-auth'];

async function getText(request,url){
  const response=await request(url,{
    method:'GET',
    redirect:'follow',
    headers:{accept:'text/html, application/json;q=0.9, */*;q=0.5'},
    signal:AbortSignal.timeout(15000)
  });
  if(!response||!response.ok)throw new Error('read-only GET failed: '+new URL(url).pathname+' status '+(response?.status||'unknown'));
  return response.text();
}

export async function verifyMallRetainedProductionSmoke({request=fetch}={}){
  const root=await getText(request,ORIGIN+'/ekodimall/');
  for(const marker of REQUIRED_MALL)if(!root.includes(marker))throw new Error('Mall public marker missing: '+marker);
  const admin=await getText(request,ORIGIN+'/ekodimall/admin/channel-settings');
  const match=admin.match(/<script\b[^>]*\bsrc=["']([^"']*workspace-admin\.js[^"']*)["']/i);
  if(!match)throw new Error('Mall channel admin script reference missing');
  const assetUrl=new URL(match[1],ORIGIN);
  if(assetUrl.origin!==ORIGIN||!assetUrl.pathname.endsWith('/workspace-admin.js')){
    throw new Error('Mall channel admin asset origin/path mismatch');
  }
  const asset=await getText(request,assetUrl.href);
  for(const marker of REQUIRED_ADMIN_ASSET)if(!asset.includes(marker))throw new Error('Mall channel admin marker missing: '+marker);
  const rawHealth=await getText(request,ORIGIN+'/marketing-publish-api/health');
  let health;
  try{health=JSON.parse(rawHealth);}catch{throw new Error('Marketing publishing health JSON invalid');}
  if(health?.ok!==true||health?.service!=='ekodi-marketing-publishing'||
     !health.scheduler||!health.channelAutomationCore){
    throw new Error('Marketing publishing runtime not ready');
  }
  return Object.freeze({
    contract:'ekodi.mall-canonical-retained-smoke.v1',
    mode:'read-only',
    routesChecked:['/ekodimall/','/ekodimall/admin/channel-settings',assetUrl.pathname,'/marketing-publish-api/health'],
    productionMutationPerformed:false,
    ok:true
  });
}

export async function verifyMallRetainedProductionSmokeWithRetry({request=fetch,attempts=3,delayMs=2000}={}){
  if(!Number.isSafeInteger(attempts)||attempts<1||attempts>5)throw new Error('Invalid bounded retry count');
  let error;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{return await verifyMallRetainedProductionSmoke({request});}
    catch(e){error=e; if(attempt<attempts && delayMs>0)await new Promise(resolve=>setTimeout(resolve,delayMs));}
  }
  throw error;
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  verifyMallRetainedProductionSmokeWithRetry().then(result=>{
    console.log(JSON.stringify(result));
  }).catch(error=>{
    console.error('[EKODI][Mall][retained-smoke] '+(error?.message||String(error)));
    process.exitCode=1;
  });
}
