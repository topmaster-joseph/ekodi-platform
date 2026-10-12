// Authorized, one-shot USER2 acceptance via EKODI-native Device Control.
// Executed only by the receipt-gated production workflow after an orchestrated merge.
import path from 'node:path';
import {fileURLToPath} from 'node:url';


const BASE='https://ekodi.kr';
const ROOT='/api/control/devices';
const CANARY='computer.browser.canary';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const when=value=>Date.parse(String(value||''));

const SAFE_BROWSER_FAILURE_CODES=new Set([
  'CDP_NODE_RUNTIME_REQUIRED','CDP_NODE_VERSION_UNAVAILABLE','CDP_NODE_22_REQUIRED',
  'CDP_WORKER_SOURCE_INVALID','CDP_WORKER_TIMEOUT','CDP_WORKER_INVALID_RECEIPT',
  'CDP_WORKER_EVIDENCE_INVALID','CDP_TARGET_FORBIDDEN','CDP_BROWSER_NOT_FOUND',
  'CDP_BROWSER_REQUIRED','CDP_BROWSER_EARLY_EXIT','CDP_BROWSER_SPAWN',
  'CDP_BROWSER_EARLY_EXIT_ACCESS','CDP_BROWSER_EARLY_EXIT_DEPENDENCY',
  'CDP_BROWSER_EARLY_EXIT_POLICY','CDP_BROWSER_EARLY_EXIT_SANDBOX',
  'CDP_BROWSER_EARLY_EXIT_ZERO','CDP_BROWSER_EARLY_EXIT_UNKNOWN',
  'CDP_PORT_TIMEOUT','CDP_PORT_INVALID','CDP_SOCKET_ERROR','CDP_SOCKET_TIMEOUT',
  'CDP_COMMAND_TIMEOUT','CDP_DOM_EVIDENCE_MISSING'
]);
// Only fixed categorical codes leave the authenticated runtime. No raw stderr,
// paths, process arguments, command results, tokens or page DOM are logged.
export function classifyUser2BrowserFailure(message) {
  const raw=typeof message==='string' ? message.slice(0,800) : '';
  const candidates=raw.match(/CDP_[A-Z0-9_]+/g)||[];
  const match=candidates.find(value=>SAFE_BROWSER_FAILURE_CODES.has(value));
  if(match)return match;
  if(raw.includes('CDP_WORKER_FAILED'))return 'CDP_WORKER_FAILED';
  if(raw.includes('background_browser_canary_failed'))return 'LEGACY_BROWSER_CANARY_FAILED';
  return 'BROWSER_FAILURE_UNCLASSIFIED';
}

export function eligibleUser2Agent(device,{now=Date.now()}={}){
  const seen=when(device?.lastSeenAt);
  return device?.hostname?.trim().toLowerCase()==='user2' &&
    device.status==='online' && device.revokedAt==null &&
    device.management?.source==='agent' && device.management?.type==='pc' &&
    /win/i.test(String(device.platform||'')) &&
    Number.isFinite(seen) && seen<=now && now-seen<=90000;
}

export async function verifyUser2Browser({token,fetchImpl=fetch,clock=()=>Date.now(),
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
    if(!response.ok)throw new Error('user2_browser_http_'+response.status);
    return data;
  }
  async function getDevices(){
    const data=await request(ROOT);
    if(!Array.isArray(data.devices))throw new Error('device_list_contract_invalid');
    return data.devices;
  }
  const eligible=(await getDevices())
    .filter(d=>eligibleUser2Agent(d,{now:clock()}))
    .sort((a,b)=>when(b.lastSeenAt)-when(a.lastSeenAt))[0];
  if(!eligible||typeof eligible.id!=='string'||!eligible.id)
    throw new Error('user2_native_agent_not_healthy');
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
      throw new Error('user2_browser_enqueue_invalid');
  }
  for(let i=0;i<maxPoll;i++){
    if(i>0)await sleepFn(pollMs);
    const device=(await getDevices()).find(d=>d.id===eligible.id);
    const receipt=(device?.recentCommands||[]).find(c=>c.id===command.id);
    if(!receipt)continue;
    if(receipt.status==='failed') {
      const reason=classifyUser2BrowserFailure(receipt.result?.message);
      throw new Error('user2_browser_failed:'+reason);
    }
    if(receipt.status==='cancelled')throw new Error('user2_browser_cancelled');
    if(receipt.status!=='succeeded')continue;
    const proof=receipt.result?.browserCanary;
    if(!proof||proof.ok!==true||proof.mode!=='native-cdp'||
      proof.url!=='https://ekodi.kr/'||!(Number(proof.contentBytes)>0)||
      proof.dedicatedAutomationProfile!==true||proof.focusIsolated!==true||
      proof.clipboardShared!==false||proof.userInputInjection!==false)
      throw new Error('user2_native_cdp_proof_invalid');
    if(!eligibleUser2Agent(device,{now:clock()}))
      throw new Error('user2_native_agent_heartbeat_lost');
    return {targetAlias:'user2',commandType:CANARY,commandId:command.id,
      receiptStatus:'succeeded',mode:'native-cdp',domBytes:Number(proof.contentBytes),
      completedAt:receipt.completedAt||null,verifiedAt:new Date(clock()).toISOString()};
  }
  throw new Error('user2_native_browser_timeout');
}


if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 verifyUser2Browser({token:process.env.E2E_ADMIN_TOKEN})
  .then(proof=>console.log('[EKODI][USER2-NATIVE-BROWSER] '+JSON.stringify(proof)))
  .catch(err=>{console.error('[EKODI][USER2-NATIVE-BROWSER] '+String(err.message||'failed').slice(0,120));process.exitCode=1;});
}
