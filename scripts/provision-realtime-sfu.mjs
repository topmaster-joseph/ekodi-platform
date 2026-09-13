import { spawnSync } from 'node:child_process';

const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const workerToken=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const wranglerVersion=process.env.WRANGLER_VERSION||'4.127.1';
const config=process.env.REALTIME_WRANGLER_CONFIG||'wrangler.api.toml';
const appName=process.env.REALTIME_SFU_APP_NAME||'ekodi-realtime-production';
const healthUrl=process.env.REALTIME_HEALTH_URL||'https://ekodi.kr/api/realtime/health';
const cloudflareApi='https://api.cloudflare.com/client/v4';
const mediaBase='https://rtc.live.cloudflare.com/v1';
const requiredSecrets=['REALTIME_SFU_APP_ID','REALTIME_SFU_APP_SECRET'];
const tokenCandidates=[
  ['dedicated',process.env.CLOUDFLARE_REALTIME_API_TOKEN],
  ['primary',process.env.CLOUDFLARE_API_TOKEN],
].map(([name,token])=>[name,String(token||'').trim()]).filter(([,token])=>token);

function fail(message){throw new Error(message)}
function wrangler(args,input=''){
  const result=spawnSync('npx',['--yes',`wrangler@${wranglerVersion}`,...args],{
    cwd:process.cwd(),env:{...process.env,CLOUDFLARE_API_TOKEN:workerToken},input,encoding:'utf8',shell:process.platform==='win32',
  });
  if(result.status!==0)fail(`wrangler command failed: ${String(result.stderr||result.stdout).trim().slice(0,500)}`);
  return String(result.stdout||'');
}
async function createSfuApp(){
  const attempts=[];
  const seen=new Set();
  for(const [source,token] of tokenCandidates){
    if(seen.has(token))continue;
    seen.add(token);
    const response=await fetch(`${cloudflareApi}/accounts/${accountId}/calls/apps`,{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({name:appName}),
    });
    const payload=await response.json().catch(()=>({success:false,errors:[{message:'invalid_json'}]}));
    if(response.ok&&payload?.success&&payload?.result?.uid&&payload?.result?.secret){
      return {uid:String(payload.result.uid),secret:String(payload.result.secret),source};
    }
    attempts.push(`${source}:${response.status}`);
    if(![401,403].includes(response.status))fail(`Realtime App create failed (${response.status}).`);
  }
  fail(`No configured Cloudflare credential has Calls Write permission (${attempts.join(', ')}).`);
}
async function verifySfuCredential(uid,secret){
  const response=await fetch(`${mediaBase}/apps/${encodeURIComponent(uid)}/sessions/new`,{
    method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload?.sessionId)fail(`Realtime SFU session probe failed (${response.status}).`);
}
function putSecret(name,value){wrangler(['secret','put',name,'--config',config],`${value}\n`)}
async function waitForHealth(attempts=18){
  for(let i=0;i<attempts;i+=1){
    try{
      const response=await fetch(healthUrl,{headers:{accept:'application/json'},cache:'no-store'});
      const payload=await response.json().catch(()=>null);
      if(response.ok&&payload?.ok===true&&payload?.providerConfigured===true)return payload;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,4000));
  }
  return null;
}
async function provision(){
  if(!accountId||!workerToken||tokenCandidates.length===0)fail('Cloudflare account and scoped credentials are required.');
  const existing=wrangler(['secret','list','--config',config]);
  if(requiredSecrets.every(name=>existing.includes(name))){
    console.log('Realtime SFU Worker secrets already exist; preserving current credentials.');
    return;
  }
  const created=await createSfuApp();
  if(!/^[a-f0-9]{32}$/i.test(created.uid)||created.secret.length<32)fail('Invalid Realtime credential shape.');
  await verifySfuCredential(created.uid,created.secret);
  putSecret('REALTIME_SFU_APP_ID',created.uid);
  putSecret('REALTIME_SFU_APP_SECRET',created.secret);
  console.log(`Realtime SFU credential provisioned from ${created.source}; direct session probe passed.`);
}
async function main(){
  if(process.argv.includes('--check')){console.log('Realtime SFU provisioner contract OK.');return}
  if(process.argv.includes('--verify')){
    const health=await waitForHealth();
    if(!health)fail('Realtime production health did not report providerConfigured=true.');
    console.log('Realtime production health confirms providerConfigured=true.');
    return;
  }
  await provision();
}
main().catch(error=>{console.error(error?.message||error);process.exitCode=1});
