// Orchestrator-receipt-gated one-time USER3 Agent upgrade and Ollama proof.
// NEVER call from scheduled observation; the only authorized caller is the
// device verification workflow's explicit user3-upgrade-localai release mode.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyNativeLocalAi} from './verify-native-localai.mjs';

const API='https://ekodi.kr/api/control/devices';
const TARGET='user3';
const UPDATE='agent.self_update';
const recently=t=>Number.isFinite(Date.parse(t||'')) && Date.now()-Date.parse(t)>=0 && Date.now()-Date.parse(t)<=90000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function pickHealthyUser3(devices,now=Date.now()){
  const eligible=(Array.isArray(devices)?devices:[]).filter(d=>
    String(d?.hostname||'').trim().toLowerCase()===TARGET &&
    d?.revokedAt==null && d?.management?.source==='agent' && d?.management?.type==='pc' &&
    /win/i.test(String(d?.platform||'')) && d?.status==='online' &&
    d?.capabilities?.agentStatus===true &&
    Number.isFinite(Date.parse(String(d?.lastSeenAt||''))) &&
    now-Date.parse(d.lastSeenAt)>=0 && now-Date.parse(d.lastSeenAt)<=90000
  );
  return eligible.sort((a,b)=>Date.parse(b.lastSeenAt)-Date.parse(a.lastSeenAt))[0]||null;
}

export async function recoverNativeUser3LocalAi({
  token,fetchImpl=fetch,clock=()=>Date.now(),sleepFn=sleep,
  pollMs=5000,maxPoll=60,verifyFn=verifyNativeLocalAi
}={}){
  if(typeof token!=='string'||token.trim().length<20)throw new Error('trusted_admin_session_required');
  const request=async(endpoint,method='GET',body)=>{
    const response=await fetchImpl(API+endpoint,{
      method,redirect:'error',cache:'no-store',
      headers:{authorization:'Bearer '+token,accept:'application/json',
        ...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('native_user3_recovery_http_'+response.status);
    return data;
  };
  const list=async()=>{
    const v=await request('');
    if(!Array.isArray(v?.devices))throw new Error('native_user3_devices_invalid');
    return v.devices;
  };
  const initial=pickHealthyUser3(await list(),clock());
  if(!initial||typeof initial.id!=='string'||!initial.id)throw new Error('no_healthy_user3_native_agent');
  const deviceId=initial.id;
  let updateId=null;
  let updated=false;
  let wasCurrent=initial.capabilities?.localAiVerify===true;
  if(!wasCurrent){
    // Avoid disrupting another active operation during a low-risk self-update.
    const inFlight=(initial.recentCommands||[]).filter(c=>['queued','claimed'].includes(c.status));
    const existing=inFlight.find(c=>c.type===UPDATE && Number.isFinite(Date.parse(c.issuedAt||'')) &&
      clock()-Date.parse(c.issuedAt)>=0 && clock()-Date.parse(c.issuedAt)<120000);
    if(inFlight.some(c=>c!==existing))throw new Error('user3_native_agent_busy');
    let command=existing;
    if(!command){
      const out=await request('/'+encodeURIComponent(deviceId)+'/commands','POST',{type:UPDATE,confirmed:true});
      command=out.command;
      if(command?.type!==UPDATE||typeof command.id!=='string'||!command.id||command.status!=='queued')
        throw new Error('native_user3_selfupdate_not_queued');
    }
    updateId=command.id;
    let updateReceipt=false;
    for(let i=0;i<maxPoll;i++){
      if(i>0)await sleepFn(pollMs);
      const current=(await list()).find(d=>d.id===deviceId);
      if(!current||current.revokedAt!=null)throw new Error('user3_agent_registration_lost');
      const receipt=(current.recentCommands||[]).find(c=>c.id===command.id);
      if(receipt&&['failed','cancelled'].includes(receipt.status))
        throw new Error('user3_agent_selfupdate_'+receipt.status);
      if(receipt?.status==='succeeded')updateReceipt=true;
      // The verified Windows upgrade restarts the Agent *after* returning its receipt.
      if(updateReceipt && pickHealthyUser3([current],clock()) &&
         current.capabilities?.localAiVerify===true) {
        updated=true;break;
      }
    }
    if(!updated)throw new Error('user3_agent_selfupdate_not_confirmed');
  }
  // This separately checks a real Windows fixed-model inference receipt.
  // It never collects Claude credentials or automatically enrolls an AI cloud node.
  const proof=await verifyFn({token,hostname:TARGET,fetchImpl,clock,sleepFn});
  if(proof?.receiptStatus!=='succeeded'||proof?.windowsAgentResponseReceived!==true||
     proof?.ollamaApi!=='ready'||proof?.inference!=='passed'||
     proof?.credentialCollection!==false)throw new Error('user3_ollama_real_receipt_invalid');
  return {
    schemaVersion:1,targetAlias:TARGET,updateCommandId:updateId,
    updatePerformed:updated,agentAlreadyCurrent:wasCurrent,
    agentUpdateVerified:wasCurrent||updated,
    commandType:proof.commandType,ollamaCommandId:proof.commandId,
    receiptStatus:'succeeded',windowsAgentResponseReceived:true,
    ollamaApi:'ready',ollamaVersion:proof.ollamaVersion||'',
    model:proof.model||'',inference:'passed',
    claudeAuth:'not_checked',credentialCollection:false,
    cloudAiNodePaired:false,observedAt:new Date(clock()).toISOString()
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  recoverNativeUser3LocalAi({token:process.env.E2E_ADMIN_TOKEN})
    .then(x=>console.log('[EKODI][USER3-NATIVE-OLLAMA-RECOVERY] '+JSON.stringify(x)))
    .catch(e=>{
      console.error('[EKODI][USER3-NATIVE-OLLAMA-RECOVERY] '+String(e.message||'recovery_failed').slice(0,110));
      process.exitCode=1;
    });
}
