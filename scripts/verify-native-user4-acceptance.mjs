// Authorized, one-shot USER4 acceptance via EKODI-native Device Control.
// Executed only by the receipt-gated production workflow after an orchestrated merge.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyNativeLocalAi} from './verify-native-localai.mjs';

const BASE='https://ekodi.kr';
const ROOT='/api/control/devices';
const CANARY='computer.browser.canary';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const when=value=>Date.parse(String(value||''));

export function eligibleUser4Agent(device,{now=Date.now()}={}){
  const seen=when(device?.lastSeenAt);
  return device?.hostname?.trim().toLowerCase()==='user4' &&
    device.status==='online' && device.revokedAt==null &&
    device.management?.source==='agent' && device.management?.type==='pc' &&
    /win/i.test(String(device.platform||'')) &&
    Number.isFinite(seen) && seen<=now && now-seen<=90000;
}

export async function verifyUser4Browser({token,fetchImpl=fetch,clock=()=>Date.now(),
  sleepFn=wait,maxPoll=35,pollMs=4000}={}){
  if(typeof token!=='string'||token.trim().length<20)throw new Error('trusted_admin_session_required');
  async function request(endpoint,method='GET',body){
    const response=await fetchImpl(BASE+endpoint,{
      method,redirect:'error',cache:'no-store',
      headers:{authorization:'Bearer '+token,accept:'application/json',
        ...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('user4_browser_http_'+response.status);
    return data;
  }
  async function getDevices(){
    const data=await request(ROOT);
    if(!Array.isArray(data.devices))throw new Error('device_list_contract_invalid');
    return data.devices;
  }
  const eligible=(await getDevices())
    .filter(d=>eligibleUser4Agent(d,{now:clock()}))
    .sort((a,b)=>when(b.lastSeenAt)-when(a.lastSeenAt))[0];
  if(!eligible||typeof eligible.id!=='string'||!eligible.id)
    throw new Error('user4_native_agent_not_healthy');
  const pending=(eligible.recentCommands||[]).find(c=>c.type===CANARY &&
    ['queued','claimed'].includes(c.status) &&
    Number.isFinite(when(c.issuedAt)) && clock()-when(c.issuedAt)>=0 &&
    clock()-when(c.issuedAt)<120000);
  let command=pending;
  if(!command){
    const data=await request(ROOT+'/'+encodeURIComponent(eligible.id)+'/commands','POST',
      {type:CANARY,confirmed:true});
    command=data.command;
    if(command?.type!==CANARY||typeof command.id!=='string'||!command.id||command.status!=='queued')
      throw new Error('user4_browser_enqueue_invalid');
  }
  for(let i=0;i<maxPoll;i++){
    if(i>0)await sleepFn(pollMs);
    const device=(await getDevices()).find(d=>d.id===eligible.id);
    const receipt=(device?.recentCommands||[]).find(c=>c.id===command.id);
    if(!receipt)continue;
    if(['failed','cancelled'].includes(receipt.status))throw new Error('user4_browser_'+receipt.status);
    if(receipt.status!=='succeeded')continue;
    const proof=receipt.result?.browserCanary;
    if(!proof||proof.ok!==true||proof.mode!=='native-cdp'||
      proof.url!=='https://ekodi.kr/'||!(Number(proof.contentBytes)>0)||
      proof.dedicatedAutomationProfile!==true||proof.focusIsolated!==true||
      proof.clipboardShared!==false||proof.userInputInjection!==false)
      throw new Error('user4_native_cdp_proof_invalid');
    if(!eligibleUser4Agent(device,{now:clock()}))
      throw new Error('user4_native_agent_heartbeat_lost');
    return {targetAlias:'user4',commandType:CANARY,commandId:command.id,
      receiptStatus:'succeeded',mode:'native-cdp',domBytes:Number(proof.contentBytes),
      completedAt:receipt.completedAt||null,verifiedAt:new Date(clock()).toISOString()};
  }
  throw new Error('user4_native_browser_timeout');
}

export async function verifyUser4Acceptance(options={}){
  const failures=[];
  let browser=null,localAi=null;
  try{browser=await verifyUser4Browser(options);}
  catch(error){failures.push('browser:'+String(error?.message||'failed').slice(0,100));}
  try{localAi=await verifyNativeLocalAi({...options,hostname:'user4'});}
  catch(error){failures.push('localAi:'+String(error?.message||'failed').slice(0,100));}
  // Two independent, host-matched execution receipts are mandatory. An empty
  // error list is not enough if one of the command verifiers returns no proof.
  const browserVerified=browser?.targetAlias==='user4' &&
    browser.receiptStatus==='succeeded' && browser.mode==='native-cdp' &&
    Number.isFinite(browser.domBytes) && browser.domBytes>0;
  const localAiVerified=localAi?.targetAlias==='user4' &&
    localAi.receiptStatus==='succeeded' && localAi.ollamaApi==='ready' &&
    localAi.inference==='passed' && localAi.credentialCollection===false;
  return {schemaVersion:1,mode:'ekodi-native-receipt-gated',
    ok:failures.length===0&&browserVerified&&localAiVerified,
    browserVerified:Boolean(browserVerified),localAiVerified:Boolean(localAiVerified),
    verifiedAt:new Date().toISOString(),targetAlias:'user4',browser,localAi,failures};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  verifyUser4Acceptance({token:process.env.E2E_ADMIN_TOKEN})
    .then(result=>{
      console.log('[EKODI][USER4-NATIVE-ACCEPTANCE] '+JSON.stringify(result));
      if(!result.ok)process.exitCode=1;
    }).catch(error=>{
      console.error('[EKODI][USER4-NATIVE-ACCEPTANCE] '+String(error?.message||'failed').slice(0,120));
      process.exitCode=1;
    });
}
