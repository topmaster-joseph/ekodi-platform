// EKODI-native, one-shot USER4 Ollama recovery. Only the registered Windows
// Ollama service may be started, and only with fresh, categorical native proof.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eligibleNativeLocalAiDevice,verifyNativeLocalAi} from './verify-native-localai.mjs';

const API='https://ekodi.kr/api/control/devices';
const VERIFY='software.localai.verify';
const RECOVER='software.localai.recover';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stamp=x=>Date.parse(String(x||''));

export function safeUser4ServiceRecoveryCandidate(device, now=Date.now()) {
  if(!eligibleNativeLocalAiDevice(device,{hostname:'user4',now}) ||
     device.capabilities?.localAiInstall!==true)return null;
  const busy=(device.recentCommands||[]).some(c=>['queued','claimed','assigned'].includes(c.status));
  if(busy)return null;
  const prior=(device.recentCommands||[])
    .filter(c=>c.type===VERIFY)
    .sort((a,b)=>stamp(b.issuedAt||b.completedAt)-stamp(a.issuedAt||a.completedAt))[0];
  if(prior?.status!=='succeeded')return null;
  const done=stamp(prior?.completedAt);
  if(!Number.isFinite(done)||done>now||now-done>300000)return null;
  const proof=prior?.result?.localAiProof;
  if(proof?.ollamaApi==='ready')return null;
  if(proof?.ollamaService!=='stopped'||proof?.ollamaProcess!=='not_running'||
     proof?.ollamaSocket!=='not_listening'||
     proof?.ollamaBind==='other_address_only')return null;
  if(!['process_not_running','loopback_port_not_listening'].includes(proof?.diagnosticCode))
    return null;
  return {deviceId:device.id,diagnosticCode:proof.diagnosticCode};
}

export async function recoverUser4ExistingOllama({token,fetchImpl=fetch,clock=()=>Date.now(),
  sleepFn=pause,maxPoll=25,pollMs=4000,verifyFn=verifyNativeLocalAi}={}) {
  if(typeof token!=='string'||token.trim().length<20)
    throw Error('trusted_admin_session_required');
  const request=async(suffix,method='GET',body)=>{
    const response=await fetchImpl(API+suffix,{
      method,redirect:'error',cache:'no-store',
      headers:{authorization:'Bearer '+token,accept:'application/json',
        ...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error('user4_service_recovery_http_'+response.status);
    return data;
  };
  const list=async()=>{
    const data=await request('');
    if(!Array.isArray(data?.devices))throw Error('user4_device_list_invalid');
    return data.devices;
  };
  // A new read-only native verify receipt is required before any write command.
  try{await verifyFn({token,hostname:'user4',fetchImpl,clock,sleepFn});}
  catch{} // Expected when Ollama API is down; inspect the actual returned receipt.
  const devices=await list();
  const eligible=devices.filter(d=>eligibleNativeLocalAiDevice(d,{hostname:'user4',now:clock()}))
    .sort((a,b)=>stamp(b.lastSeenAt)-stamp(a.lastSeenAt))[0];
  const candidate=safeUser4ServiceRecoveryCandidate(eligible,clock());
  if(!candidate||typeof candidate.deviceId!=='string'||!candidate.deviceId)
    throw Error('user4_registered_stopped_service_proof_required');
  const result=await request('/'+encodeURIComponent(candidate.deviceId)+'/commands','POST',
    {type:RECOVER,confirmed:true});
  const command=result.command;
  if(command?.type!==RECOVER||typeof command.id!=='string'||!command.id||
     command.status!=='queued')throw Error('user4_service_recovery_enqueue_invalid');
  for(let i=0;i<maxPoll;i++){
    if(i>0)await sleepFn(pollMs);
    const current=(await list()).find(d=>d.id===candidate.deviceId);
    if(!current||current.hostname?.trim().toLowerCase()!=='user4'||current.revokedAt)
      throw Error('user4_agent_registration_changed');
    const receipt=(current.recentCommands||[]).find(c=>c.id===command.id);
    if(!receipt)continue;
    if(['failed','cancelled'].includes(receipt.status))
      throw Error('user4_service_recovery_'+receipt.status);
    if(receipt.status!=='succeeded')continue;
    const data=receipt.result;
    if(data?.localAiRecovery?.recovered!==true||
       data?.localAiRecovery?.mode!=='registered_service_only'||
       data?.localAiProof?.ollamaApi!=='ready'||
       data?.localAiProof?.inference!=='passed'||
       data?.localAiProof?.credentialCollection!==false)
      throw Error('user4_service_recovery_receipt_invalid');
    const verified=await verifyFn({token,hostname:'user4',fetchImpl,clock,sleepFn});
    if(verified?.targetAlias!=='user4'||verified?.receiptStatus!=='succeeded'||
       verified?.ollamaApi!=='ready'||verified?.inference!=='passed')
      throw Error('user4_ollama_post_recovery_inference_not_ready');
    return {targetAlias:'user4',mode:'registered_service_only',
      serviceStartAttempted:true,serviceRecovered:true,localAiVerified:true,
      commandId:command.id,verificationCommandId:verified.commandId,
      model:verified.model,verifiedAt:new Date(clock()).toISOString()};
  }
  throw Error('user4_service_recovery_receipt_timeout');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  recoverUser4ExistingOllama({token:process.env.E2E_ADMIN_TOKEN})
    .then(r=>console.log('[EKODI][USER4-SERVICE-RECOVERY] '+JSON.stringify(r)))
    .catch(e=>{console.error('[EKODI][USER4-SERVICE-RECOVERY] '+String(e.message||'failed').slice(0,110));process.exitCode=1;});
}
