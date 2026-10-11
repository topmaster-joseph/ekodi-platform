// One-time owner-approved EKODI-native USER4 Agent refresh and browser/AI proof.
// This is never called from scheduled read-only observation.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eligibleUser4Agent,verifyUser4Acceptance} from './verify-native-user4-acceptance.mjs';

const API='https://ekodi.kr/api/control/devices';
const UPDATE='agent.self_update';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const time=value=>Date.parse(String(value||''));
export async function recoverNativeUser4Browser({
  token,fetchImpl=fetch,clock=()=>Date.now(),sleepFn=sleep,
  pollMs=5000,maxPoll=60,acceptanceFn=verifyUser4Acceptance
}={}){
  if(typeof token!=='string'||token.trim().length<20)throw new Error('trusted_admin_session_required');
  async function request(endpoint,method='GET',body){
    const res=await fetchImpl(API+endpoint,{
      method,redirect:'error',cache:'no-store',
      headers:{authorization:'Bearer '+token,accept:'application/json',
        ...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error('user4_update_http_'+res.status);
    return data;
  }
  async function listDevices(){
    const v=await request('');
    if(!Array.isArray(v.devices))throw new Error('user4_device_list_invalid');
    return v.devices;
  }
  const devices=await listDevices();
  const device=devices.filter(d=>eligibleUser4Agent(d,{now:clock()}) &&
    d.capabilities?.agentStatus===true)
    .sort((a,b)=>time(b.lastSeenAt)-time(a.lastSeenAt))[0];
  if(!device||typeof device.id!=='string'||!device.id)
    throw new Error('user4_native_agent_not_healthy');
  const ongoing=(device.recentCommands||[]).filter(c=>['queued','claimed'].includes(c.status));
  const existing=ongoing.find(c=>c.type===UPDATE && Number.isFinite(time(c.issuedAt)) &&
    clock()-time(c.issuedAt)>=0 && clock()-time(c.issuedAt)<120000);
  if(ongoing.some(c=>c!==existing))throw new Error('user4_agent_busy');
  let command=existing;
  if(!command){
    const response=await request('/'+encodeURIComponent(device.id)+'/commands','POST',
      {type:UPDATE,confirmed:true});
    command=response.command;
    if(command?.type!==UPDATE||typeof command.id!=='string'||!command.id||
      command.status!=='queued')throw new Error('user4_agent_update_not_queued');
  }
  let confirmed=null;
  for(let i=0;i<maxPoll;i++){
    if(i>0)await sleepFn(pollMs);
    const current=(await listDevices()).find(d=>d.id===device.id);
    if(!current||current.revokedAt!=null)throw new Error('user4_agent_registration_lost');
    const receipt=(current.recentCommands||[]).find(c=>c.id===command.id);
    if(receipt&&['failed','cancelled'].includes(receipt.status))
      throw new Error('user4_agent_update_'+receipt.status);
    const completedAt=time(receipt?.completedAt);
    const restartedHeartbeat=time(current.lastSeenAt);
    if(receipt?.status==='succeeded'&&Number.isFinite(completedAt)&&
      Number.isFinite(restartedHeartbeat)&&restartedHeartbeat>completedAt &&
      eligibleUser4Agent(current,{now:clock()})){
      confirmed={commandId:command.id,status:'succeeded',
        targetAlias:'user4',reconnectedAt:new Date(restartedHeartbeat).toISOString()};
      break;
    }
  }
  if(!confirmed)throw new Error('user4_agent_update_or_reconnect_timeout');
  const acceptance=await acceptanceFn({token,fetchImpl,clock,sleepFn});
  const passed=acceptance?.ok===true && acceptance.targetAlias==='user4' &&
    acceptance.browserVerified===true && acceptance.localAiVerified===true;
  return {schemaVersion:1,mode:'native-user4-refresh-and-verify',
    ok:passed,agentUpdate:confirmed,acceptance:acceptance||null,
    targetAlias:'user4',verifiedAt:new Date(clock()).toISOString()};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  recoverNativeUser4Browser({token:process.env.E2E_ADMIN_TOKEN})
    .then(result=>{
      console.log('[EKODI][USER4-NATIVE-BROWSER-RECOVERY] '+JSON.stringify(result));
      if(!result.ok)process.exitCode=1;
    })
    .catch(e=>{
      console.error('[EKODI][USER4-NATIVE-BROWSER-RECOVERY] '+String(e?.message||'failed').slice(0,120));
      process.exitCode=1;
    });
}
