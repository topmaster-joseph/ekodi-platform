// Receipt-gated one-shot USER2 native Agent browser recovery.
// It never enables Hyper-V, reboots Windows, creates a VM, attaches to the user desktop,
// shares clipboard, injects foreground input, or uses an external browser provider.
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const BASE='https://ekodi.kr';
const ROOT='/api/control/devices';
const TARGET='user2';
const UPDATE='agent.self_update';
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

export function classifyUser2BrowserFailure(message){
  const raw=typeof message==='string'?message.slice(0,800):'';
  const candidates=raw.match(/CDP_[A-Z0-9_]+/g)||[];
  const match=candidates.find(value=>SAFE_BROWSER_FAILURE_CODES.has(value));
  if(match)return match;
  if(raw.includes('CDP_WORKER_FAILED'))return 'CDP_WORKER_FAILED';
  if(raw.includes('background_browser_canary_failed'))return 'LEGACY_BROWSER_CANARY_FAILED';
  return 'BROWSER_FAILURE_UNCLASSIFIED';
}

export function eligibleUser2Agent(device,{now=Date.now()}={}){
  const seen=when(device?.lastSeenAt);
  return String(device?.hostname||'').trim().toLowerCase()===TARGET &&
    device?.status==='online' && device?.revokedAt==null &&
    device?.management?.source==='agent' && device?.management?.type==='pc' &&
    /win/i.test(String(device?.platform||'')) &&
    device?.capabilities?.agentStatus===true &&
    Number.isFinite(seen) && seen<=now+5000 && now-seen>=0 && now-seen<=90000;
}

function browserCapabilityReady(device){
  return device?.capabilities?.backgroundBrowser===true &&
    device?.capabilities?.backgroundBrowserCanary===true;
}

export async function recoverUser2NativeBrowser({
  token,fetchImpl=fetch,clock=()=>Date.now(),sleepFn=wait,
  updatePollMs=4000,updateMaxPoll=65,canaryPollMs=4000,canaryMaxPoll=35
}={}){
  if(typeof token!=='string'||token.trim().length<20)throw new Error('trusted_admin_session_required');
  const request=async(endpoint='',method='GET',body)=>{
    const response=await fetchImpl(BASE+ROOT+endpoint,{
      method,redirect:'error',cache:'no-store',
      headers:{authorization:'Bearer '+token,accept:'application/json',
        ...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('user2_browser_recovery_http_'+response.status);
    return data;
  };
  const list=async()=>{
    const data=await request();
    if(!Array.isArray(data?.devices))throw new Error('user2_browser_devices_invalid');
    return data.devices;
  };
  const choose=devices=>(Array.isArray(devices)?devices:[])
    .filter(d=>eligibleUser2Agent(d,{now:clock()}))
    .sort((a,b)=>when(b.lastSeenAt)-when(a.lastSeenAt))[0]||null;

  let device=choose(await list());
  if(!device?.id)throw new Error('user2_native_agent_not_healthy');
  const deviceId=device.id;
  let updatePerformed=false;
  let updateCommandId=null;

  if(!browserCapabilityReady(device)){
    const inflight=(device.recentCommands||[]).filter(c=>['queued','claimed'].includes(c.status));
    const reusable=inflight.find(c=>c.type===UPDATE && Number.isFinite(when(c.issuedAt)) &&
      clock()-when(c.issuedAt)>=0 && clock()-when(c.issuedAt)<120000);
    if(inflight.some(c=>c!==reusable))throw new Error('user2_agent_busy_no_interruption');
    let update=reusable;
    if(!update){
      const out=await request('/'+encodeURIComponent(deviceId)+'/commands','POST',{type:UPDATE,confirmed:true});
      update=out.command;
      if(update?.type!==UPDATE||typeof update.id!=='string'||!update.id||update.status!=='queued')
        throw new Error('user2_official_update_enqueue_invalid');
    }
    updateCommandId=update.id;
    let completedAt=NaN;
    for(let i=0;i<updateMaxPoll;i++){
      if(i>0)await sleepFn(updatePollMs);
      const current=(await list()).find(d=>d.id===deviceId);
      if(!current||current.revokedAt!=null)throw new Error('user2_agent_registration_lost');
      const receipt=(current.recentCommands||[]).find(c=>c.id===update.id);
      if(receipt&&['failed','cancelled'].includes(receipt.status))
        throw new Error('user2_agent_official_update_'+receipt.status);
      if(receipt?.status==='succeeded'){
        completedAt=when(receipt.completedAt);
        if(!Number.isFinite(completedAt))throw new Error('user2_agent_update_receipt_invalid');
      }
      if(Number.isFinite(completedAt) && eligibleUser2Agent(current,{now:clock()}) &&
        when(current.lastSeenAt)>=completedAt && browserCapabilityReady(current)){
        device=current;updatePerformed=true;break;
      }
    }
    if(!browserCapabilityReady(device))throw new Error('user2_browser_capability_not_confirmed_after_update');
  }

  const inflight=(device.recentCommands||[]).filter(c=>['queued','claimed'].includes(c.status));
  const pending=inflight.find(c=>c.type===CANARY && Number.isFinite(when(c.issuedAt)) &&
    clock()-when(c.issuedAt)>=0 && clock()-when(c.issuedAt)<120000);
  if(inflight.some(c=>c!==pending))throw new Error('user2_agent_busy_before_browser_canary');
  let command=pending;
  if(!command){
    const out=await request('/'+encodeURIComponent(deviceId)+'/commands','POST',{type:CANARY,confirmed:true});
    command=out.command;
    if(command?.type!==CANARY||typeof command.id!=='string'||!command.id||command.status!=='queued')
      throw new Error('user2_browser_enqueue_invalid');
  }

  for(let i=0;i<canaryMaxPoll;i++){
    if(i>0)await sleepFn(canaryPollMs);
    const current=(await list()).find(d=>d.id===deviceId);
    if(!current||!eligibleUser2Agent(current,{now:clock()}))
      throw new Error('user2_native_agent_heartbeat_lost');
    const receipt=(current.recentCommands||[]).find(c=>c.id===command.id);
    if(!receipt)continue;
    if(receipt.status==='failed')
      throw new Error('user2_browser_failed:'+classifyUser2BrowserFailure(receipt.result?.message));
    if(receipt.status==='cancelled')throw new Error('user2_browser_cancelled');
    if(receipt.status!=='succeeded')continue;
    const proof=receipt.result?.browserCanary;
    if(!proof||proof.ok!==true||proof.mode!=='native-cdp'||
      proof.url!=='https://ekodi.kr/'||!(Number(proof.contentBytes)>0)||
      proof.dedicatedAutomationProfile!==true||proof.focusIsolated!==true||
      proof.clipboardShared!==false||proof.userInputInjection!==false)
      throw new Error('user2_native_cdp_proof_invalid');
    return {
      schemaVersion:1,targetAlias:TARGET,ok:true,
      agentUpdate:{performed:updatePerformed,commandId:updateCommandId},
      browser:{commandType:CANARY,commandId:command.id,receiptStatus:'succeeded',
        mode:'native-cdp',domBytes:Number(proof.contentBytes),completedAt:receipt.completedAt||null},
      backgroundBrowser:true,backgroundBrowserCanary:true,
      externalProviderUsed:false,userDesktopAttached:false,
      clipboardShared:false,userInputInjection:false,
      sessionExecutionAuthorized:false,
      supportedTaskClasses:['browser-ui-validation','isolated-browser-execution'],
      unsupportedTaskClasses:['isolated-desktop-execution','full-computer-use','unbounded-desktop-execution'],
      verifiedAt:new Date(clock()).toISOString()
    };
  }
  throw new Error('user2_native_browser_timeout');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  recoverUser2NativeBrowser({token:process.env.E2E_ADMIN_TOKEN})
    .then(result=>console.log('[EKODI][USER2-NATIVE-BROWSER-RECOVERY] '+JSON.stringify(result)))
    .catch(error=>{console.error('[EKODI][USER2-NATIVE-BROWSER-RECOVERY] '+String(error?.message||'failed').slice(0,120));process.exitCode=1;});
}
