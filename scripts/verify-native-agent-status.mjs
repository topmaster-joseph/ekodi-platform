// Receipt-gated, bounded EKODI-native Windows Agent command proof.
// Invoked exclusively by Device Agent Production Verification status mode.
const BASE='https://ekodi.kr';
const DEVICE_LIST='/api/control/devices';
const COMMAND='computer.agent.status';
const norm=x=>String(x||'').trim().toLowerCase();
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const when=x=>Date.parse(String(x||''));

export async function verifyNativeAgentStatus({
  token,hostname='user3',fetchImpl=fetch,now=()=>Date.now(),
  sleepFn=sleep,maxPoll=20,pollMs=3000
}={}){
  if(typeof token!=='string'||token.trim().length<20)throw new Error('trusted_admin_session_required');
  const target=norm(hostname);
  if(!/^[a-z0-9-]{2,48}$/.test(target))throw new Error('invalid_target_hostname');
  async function request(path,method='GET',body){
    const response=await fetchImpl(BASE+path,{
      method,redirect:'error',cache:'no-store',
      headers:{authorization:'Bearer '+token,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('native_agent_status_http_'+response.status);
    return data;
  }
  async function getDevices(){
    const out=await request(DEVICE_LIST);
    if(!Array.isArray(out?.devices))throw new Error('native_device_response_invalid');
    return out.devices;
  }
  const devices=await getDevices();
  const matches=devices.filter(d=>
    norm(d.hostname)===target && d.revokedAt==null &&
    d.management?.source==='agent' && d.management?.type==='pc' &&
    /win/i.test(String(d.platform||'')) && d.capabilities?.agentStatus===true &&
    d.status==='online' && Number.isFinite(when(d.lastSeenAt)) &&
    now()-when(d.lastSeenAt)>=0 && now()-when(d.lastSeenAt)<=90000);
  const eligible=matches.sort((a,b)=>when(b.lastSeenAt)-when(a.lastSeenAt))[0];
  if(!eligible||typeof eligible.id!=='string'||!eligible.id)throw new Error('no_healthy_eligible_user3_agent');
  const existing=(eligible.recentCommands||[]).find(c=>c.type===COMMAND &&
    ['queued','claimed'].includes(c.status) && Number.isFinite(when(c.issuedAt)) &&
    now()-when(c.issuedAt)>=0 && now()-when(c.issuedAt)<120000);
  let command;
  if(existing)command=existing;
  else {
    const out=await request(DEVICE_LIST+'/'+encodeURIComponent(eligible.id)+'/commands','POST',{type:COMMAND,confirmed:true});
    command=out.command;
    if(command?.type!==COMMAND || typeof command.id!=='string'||!command.id||command.status!=='queued')throw new Error('native_agent_status_enqueue_invalid');
  }
  for(let attempt=0;attempt<maxPoll;attempt++){
    if(attempt>0)await sleepFn(pollMs);
    const items=await getDevices();
    const device=items.find(d=>d.id===eligible.id);
    const receipt=(device?.recentCommands||[]).find(c=>c.id===command.id);
    if(!receipt)continue;
    if(['failed','cancelled'].includes(receipt.status))throw new Error('native_agent_status_command_'+receipt.status);
    if(receipt.status==='succeeded'){
      if(!receipt.result?.agent || typeof receipt.result.agent!=='object')throw new Error('native_agent_status_no_windows_result');
      return {
        schemaVersion:1,commandType:COMMAND,targetAlias:target,
        commandId:command.id,receiptStatus:'succeeded',
        windowsAgentResponseReceived:true,
        deviceHeartbeatHealthy:device.status==='online',
        completedAt:receipt.completedAt||null,
        observedAt:new Date(now()).toISOString()
      };
    }
  }
  throw new Error('native_agent_status_command_timeout');
}

if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  verifyNativeAgentStatus({token:process.env.E2E_ADMIN_TOKEN,hostname:process.env.DEVICE_TARGET_HOSTNAME||'user3'})
  .then(result=>console.log('[EKODI][NATIVE-STATUS-CANARY] '+JSON.stringify(result)))
  .catch(error=>{console.error('[EKODI][NATIVE-STATUS-CANARY] '+String(error?.message||'status_verify_failed').slice(0,100));process.exitCode=1;});
}
