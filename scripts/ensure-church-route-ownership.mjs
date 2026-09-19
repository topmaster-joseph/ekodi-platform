import { pathToFileURL } from 'node:url';
const API='https://api.cloudflare.com/client/v4';
export const CHURCH_ROUTE_CONTRACT=Object.freeze({
  gateway:'ekodi-church-path-gateway',
  desiredGateway:['ekodi.kr/ekodichurch','ekodi.kr/ekodichurch/*'],
  retiredGateway:'ekodi.kr/ekodichurch*',
  publicUrl:'https://ekodi.kr/ekodichurch/',
  adminUrl:'https://ekodi.kr/ekodichurch/admin',
  publicRoute:'church-public-path',
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
function retryAfterMs(response,now=Date.now()){
  const value=String(response?.headers?.get?.('retry-after')||'').trim();
  if(!value)return 0;
  if(/^\d+(?:\.\d+)?$/.test(value))return Math.max(0,Number(value)*1000);
  const retryAt=Date.parse(value);return Number.isFinite(retryAt)?Math.max(0,retryAt-now):0;
}
export async function verifyChurchLive(url,expectedRoute,{fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=10}={}){
  let last='';
  for(let attempt=1;attempt<=attempts;attempt++){
    let delay=Math.min(30000,1500*(2**Math.min(attempt-1,4)));
    try{
      const response=await fetchImpl(url,{redirect:'manual',cache:'no-store'});
      const route=response.headers.get('x-ekodi-route')||'';
      last=`HTTP ${response.status}, x-ekodi-route=${route||'missing'}`;
      if(response.status===200&&route===expectedRoute)return;
      if(response.status===429){
        delay=Math.min(30000,Math.max(delay,retryAfterMs(response)));
        console.warn(`Church live verification rate-limited for ${url}; retrying in ${delay}ms (attempt ${attempt}/${attempts}).`);
      }
    }catch(error){last=error.message}
    if(attempt<attempts)await sleep(delay);
  }
  throw new Error(`Live route verification failed for ${url}: ${last}`);
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
  for(const pattern of CHURCH_ROUTE_CONTRACT.desiredGateway){
    const row=routes.find(item=>item.pattern===pattern);
    if(row?.script!==CHURCH_ROUTE_CONTRACT.gateway)throw new Error(`Church gateway route missing after repair: ${pattern}`);
  }
  if(routes.some(row=>row.pattern===CHURCH_ROUTE_CONTRACT.retiredGateway&&row.script===CHURCH_ROUTE_CONTRACT.gateway))throw new Error('Ambiguous church gateway route still present');
  await verifyChurchLive(CHURCH_ROUTE_CONTRACT.publicUrl,CHURCH_ROUTE_CONTRACT.publicRoute);
  await verifyChurchLive(CHURCH_ROUTE_CONTRACT.adminUrl,CHURCH_ROUTE_CONTRACT.adminRoute);
  console.log('Church route ownership and live boundaries verified.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  ensureChurchRouteOwnership().catch(error=>{console.error(error.message);process.exitCode=1});
}
