import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isQuotaCircuitBreak } from './cloudflare-quota-guard-lib.mjs';
const quotaConfig=JSON.parse(await readFile(fileURLToPath(new URL('../config/cloudflare-production-quota-guard.json',import.meta.url)),'utf8'));
const API='https://api.cloudflare.com/client/v4';
export const CHURCH_ROUTE_CONTRACT=Object.freeze({
  gateway:'ekodi-church-path-gateway',
  sharedSite:'shy-thunder-39a4',
  desiredGateway:['ekodi.kr/ekodichurch','ekodi.kr/ekodichurch/*'],
  memberRedirectRoutes:['ekodi.kr/ekodichurch/my'],
  retiredMemberRoutes:['ekodi.kr/ekodichurch/my/*'],
  retiredGateway:'ekodi.kr/ekodichurch*',
  publicUrl:'https://ekodi.kr/ekodichurch/',
  memberUrl:'https://ekodi.kr/ekodichurch/my',
  memberCanonicalUrl:'https://ekodi.kr/ekodichurch/my/',
  memberDeepPages:[
    {url:'https://ekodi.kr/ekodichurch/my/giving/',marker:'MY GIVING'},
    {url:'https://ekodi.kr/ekodichurch/my/attendance/',marker:'MY ATTENDANCE'},
  ],
  adminUrl:'https://ekodi.kr/ekodichurch/admin',
  publicRoute:'church-public-path',
  memberRoute:'church-member-canonical-redirect',
  adminRoute:'church-pastor-admin',
});
function headers(token){return{Authorization:`Bearer ${token}`,'content-type':'application/json'}}
async function cf(url,token,options={}){
  const response=await fetch(API+url,{...options,headers:{...headers(token),...(options.headers||{})}});
  const data=await response.json().catch(()=>({success:false,errors:[{message:`HTTP ${response.status}`}]}));
  if(!response.ok||data.success===false)throw new Error((data.errors||[]).map(x=>x.message).join('; ')||`Cloudflare HTTP ${response.status}`);
  return data;
}
async function createRoute(zone,token,pattern,script){
  await cf(`/zones/${zone}/workers/routes`,token,{method:'POST',body:JSON.stringify({pattern,script})});
  console.log(`Created route: ${pattern} -> ${script}`);
}
async function verifyLive(url,expectedRoute){
  let last='';
  for(let attempt=1;attempt<=10;attempt++){
    try{
      const response=await fetch(url,{redirect:'manual',cache:'no-store'});
      const route=response.headers.get('x-ekodi-route')||'';
      const body=await response.text().catch(()=>'');
      last=`HTTP ${response.status}, x-ekodi-route=${route||'missing'}`;
      if(isQuotaCircuitBreak({status:response.status,body,config:quotaConfig.circuitBreaker})){
        throw new Error(`CF-QUOTA-001 circuit open for ${url}: ${last}; no retry`);
      }
      if(response.status===200&&route===expectedRoute)return;
    }catch(error){
      last=error?.message||String(error);
      if(last.includes('CF-QUOTA-001 circuit open'))throw error;
    }
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw new Error(`Live route verification failed for ${url}: ${last}`);
}

async function verifyRedirect(url,expectedLocation,expectedRoute){
  let last='';
  for(let attempt=1;attempt<=10;attempt++){
    try{
      const response=await fetch(url,{redirect:'manual',cache:'no-store'});
      const route=response.headers.get('x-ekodi-route')||'';
      const location=response.headers.get('location')||'';
      const body=await response.text().catch(()=>'');
      last=`HTTP ${response.status}, location=${location||'missing'}, x-ekodi-route=${route||'missing'}`;
      if(isQuotaCircuitBreak({status:response.status,body,config:quotaConfig.circuitBreaker})){
        throw new Error(`CF-QUOTA-001 circuit open for ${url}: ${last}; no retry`);
      }
      if(response.status===308&&location===expectedLocation&&route===expectedRoute)return;
    }catch(error){
      last=error?.message||String(error);
      if(last.includes('CF-QUOTA-001 circuit open'))throw error;
    }
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw new Error(`Live redirect verification failed for ${url}: ${last}`);
}
async function verifyMemberPage(url,marker){
  let last='';
  for(let attempt=1;attempt<=10;attempt++){
    try{
      const response=await fetch(url,{redirect:'follow',cache:'no-store'});
      const body=await response.text().catch(()=>'');
      last=`HTTP ${response.status}, marker=${body.includes(marker)}, yogurt=${body.includes('YOGURT PURPLE')}`;
      if(isQuotaCircuitBreak({status:response.status,body,config:quotaConfig.circuitBreaker})){
        throw new Error(`CF-QUOTA-001 circuit open for ${url}: ${last}; no retry`);
      }
      if(response.status===200&&body.includes(marker)&&!body.includes('YOGURT PURPLE'))return;
    }catch(error){
      last=error?.message||String(error);
      if(last.includes('CF-QUOTA-001 circuit open'))throw error;
    }
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw new Error(`Church member page verification failed for ${url}: ${last}`);
}
export async function ensureChurchRouteOwnership({token=process.env.CLOUDFLARE_API_TOKEN}={}){
  if(!token)throw new Error('Missing CLOUDFLARE_API_TOKEN');
  const zones=await cf('/zones?name=ekodi.kr&status=active',token);
  const zone=zones.result?.[0]?.id;if(!zone)throw new Error('ekodi.kr zone not found');
  let routes=(await cf(`/zones/${zone}/workers/routes`,token)).result||[];
  for(const pattern of CHURCH_ROUTE_CONTRACT.desiredGateway){
    const current=routes.find(row=>row.pattern===pattern);
    if(current?.script===CHURCH_ROUTE_CONTRACT.gateway)continue;
    if(current)throw new Error(`Route ${pattern} is owned by ${current.script||'none'}`);
    await createRoute(zone,token,pattern,CHURCH_ROUTE_CONTRACT.gateway);
  }
  routes=(await cf(`/zones/${zone}/workers/routes`,token)).result||[];
  const retired=routes.find(row=>row.pattern===CHURCH_ROUTE_CONTRACT.retiredGateway&&row.script===CHURCH_ROUTE_CONTRACT.gateway);
  if(retired){await cf(`/zones/${zone}/workers/routes/${retired.id}`,token,{method:'DELETE'});console.log(`Retired ambiguous route: ${retired.pattern}`)}
  routes=(await cf(`/zones/${zone}/workers/routes`,token)).result||[];
  for(const pattern of CHURCH_ROUTE_CONTRACT.memberRedirectRoutes){
    const current=routes.find(row=>row.pattern===pattern);
    if(current?.script===CHURCH_ROUTE_CONTRACT.sharedSite)continue;
    if(current){
      await cf(`/zones/${zone}/workers/routes/${current.id}`,token,{method:'DELETE'});
      console.log(`Reassigned route: ${pattern} from ${current.script||'none'} to ${CHURCH_ROUTE_CONTRACT.sharedSite}`);
    }
    await createRoute(zone,token,pattern,CHURCH_ROUTE_CONTRACT.sharedSite);
    routes=(await cf(`/zones/${zone}/workers/routes`,token)).result||[];
  }
  for(const pattern of CHURCH_ROUTE_CONTRACT.retiredMemberRoutes){
    const current=routes.find(row=>row.pattern===pattern);
    if(!current)continue;
    if(current.script!==CHURCH_ROUTE_CONTRACT.sharedSite)throw new Error(`Church member descendant route ${pattern} is owned by ${current.script||'none'}`);
    await cf(`/zones/${zone}/workers/routes/${current.id}`,token,{method:'DELETE'});
    console.log(`Released Church member descendant route to Pages gateway: ${pattern}`);
    routes=(await cf(`/zones/${zone}/workers/routes`,token)).result||[];
  }
  for(const pattern of CHURCH_ROUTE_CONTRACT.desiredGateway){
    const row=routes.find(item=>item.pattern===pattern);
    if(row?.script!==CHURCH_ROUTE_CONTRACT.gateway)throw new Error(`Church gateway route missing after repair: ${pattern}`);
  }
  for(const pattern of CHURCH_ROUTE_CONTRACT.memberRedirectRoutes){
    const row=routes.find(item=>item.pattern===pattern);
    if(row?.script!==CHURCH_ROUTE_CONTRACT.sharedSite)throw new Error(`Church member canonical redirect route missing after repair: ${pattern}`);
  }
  for(const pattern of CHURCH_ROUTE_CONTRACT.retiredMemberRoutes){
    if(routes.some(row=>row.pattern===pattern))throw new Error(`Church member descendant route must stay with the generic Pages gateway: ${pattern}`);
  }
  if(routes.some(row=>row.pattern===CHURCH_ROUTE_CONTRACT.retiredGateway&&row.script===CHURCH_ROUTE_CONTRACT.gateway))throw new Error('Ambiguous church gateway route still present');
  await verifyLive(CHURCH_ROUTE_CONTRACT.publicUrl,CHURCH_ROUTE_CONTRACT.publicRoute);
  // Route ownership is repaired before the new Shared Site candidate is deployed.
  // The exact /my -> /my/ redirect therefore still reflects the previous Worker here
  // and is verified by the guarded candidate manifest immediately after deployment.
  console.log('Church member canonical redirect response verification deferred to guarded candidate deployment.');
  for(const page of CHURCH_ROUTE_CONTRACT.memberDeepPages)await verifyMemberPage(page.url,page.marker);
  await verifyLive(CHURCH_ROUTE_CONTRACT.adminUrl,CHURCH_ROUTE_CONTRACT.adminRoute);
  console.log('Church public/admin boundaries and Pages-owned member descendants verified before candidate promotion.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  ensureChurchRouteOwnership().catch(error=>{console.error(error.message);process.exitCode=1});
}
