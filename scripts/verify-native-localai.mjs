// Bounded USER3 EKODI-native loopback Ollama inference acceptance proof.
// Command execution is restricted to the Orchestrator receipt-gated 'localai' mode.
const BASE='https://ekodi.kr';
const API='/api/control/devices';
const COMMAND='software.localai.verify';
const norm=x=>String(x||'').trim().toLowerCase();
const when=x=>Date.parse(String(x||''));
const wait=ms=>new Promise(done=>setTimeout(done,ms));

export function eligibleNativeLocalAiDevice(d,{hostname='user3',now=Date.now()}={}){
  const seen=when(d?.lastSeenAt);
  return Boolean(
    norm(d?.hostname)===norm(hostname) &&
    d?.status==='online' && d?.revokedAt==null &&
    d?.management?.source==='agent' && d?.management?.type==='pc' &&
    /win/i.test(String(d?.platform||'')) &&
    d?.capabilities?.localAiVerify===true &&
    Number.isFinite(seen) && now-seen>=0 && now-seen<=90000
  );
}

export async function verifyNativeLocalAi({token,hostname='user3',fetchImpl=fetch,
  clock=()=>Date.now(),sleepFn=wait,maxPoll=24,pollMs=4000}={}){
  if(typeof token!=='string'||token.trim().length<20)throw new Error('trusted_admin_session_required');
  const target=norm(hostname);
  if(!/^[a-z0-9-]{2,48}$/.test(target))throw new Error('invalid_target_hostname');
  async function request(endpoint,method='GET',body){
    const response=await fetchImpl(BASE+endpoint,{
      method,redirect:'error',cache:'no-store',
      headers:{authorization:'Bearer '+token,accept:'application/json',
        ...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('native_localai_http_'+response.status);
    return data;
  }
  const getDevices=async()=>{
    const data=await request(API);
    if(!Array.isArray(data?.devices))throw new Error('native_localai_device_contract_invalid');
    return data.devices;
  };
  const devices=await getDevices();
  const eligible=devices.filter(d=>eligibleNativeLocalAiDevice(d,{hostname:target,now:clock()}))
    .sort((a,b)=>when(b.lastSeenAt)-when(a.lastSeenAt))[0];
  if(!eligible||typeof eligible.id!=='string'||!eligible.id)throw new Error('no_healthy_localai_verify_user3_agent');
  const existing=(eligible.recentCommands||[]).find(c=>c.type===COMMAND &&
    ['queued','claimed'].includes(c.status) && Number.isFinite(when(c.issuedAt)) &&
    clock()-when(c.issuedAt)>=0 && clock()-when(c.issuedAt)<120000);
  let command=existing;
  if(!command){
    const response=await request(API+'/'+encodeURIComponent(eligible.id)+'/commands','POST',
      {type:COMMAND,confirmed:true});
    command=response.command;
    if(!command||command.type!==COMMAND||typeof command.id!=='string'||!command.id ||
      command.status!=='queued')throw new Error('native_localai_command_queue_invalid');
  }
  for(let n=0;n<maxPoll;n++){
    if(n>0)await sleepFn(pollMs);
    const current=(await getDevices()).find(d=>d.id===eligible.id);
    const receipt=(current?.recentCommands||[]).find(c=>c.id===command.id);
    if(!receipt)continue;
    if(['failed','cancelled'].includes(receipt.status))throw new Error('native_localai_command_'+receipt.status);
    if(receipt.status!=='succeeded')continue;
    const proof=receipt.result?.localAiProof;
    if(!proof||typeof proof!=='object')throw new Error('native_localai_missing_real_windows_proof');
    if(proof.credentialCollection!==false||proof.executionMode!=='fixed_loopback_api')
      throw new Error('native_localai_unapproved_diagnostic_mode');
    if(proof.ollamaApi!=='ready'||proof.inference!=='passed')
      throw new Error('native_localai_inference_not_ready');
    if(current.status!=='online')throw new Error('native_localai_heartbeat_lost_after_command');
    return {
      schemaVersion:1,targetAlias:target,commandType:COMMAND,commandId:command.id,
      receiptStatus:'succeeded',windowsAgentResponseReceived:true,
      ollamaApi:'ready',ollamaVersion:String(proof.ollamaVersion||'').slice(0,70),
      model:String(proof.selectedModel||'').slice(0,50),inference:'passed',
      claudeCli:proof.claudeCli==='visible_in_agent_context'?'visible_in_agent_context':'not_visible_to_agent',
      claudeAuth:'not_checked',credentialCollection:false,
      cloudAiNodePaired:false,completedAt:receipt.completedAt||null,
      observedAt:new Date(clock()).toISOString()
    };
  }
  throw new Error('native_localai_command_timeout');
}

if(process.argv[1]&&process.argv[1].endsWith('/verify-native-localai.mjs')){
  verifyNativeLocalAi({token:process.env.E2E_ADMIN_TOKEN,hostname:process.env.DEVICE_TARGET_HOSTNAME||'user3'})
  .then(x=>console.log('[EKODI][NATIVE-LOCALAI-CANARY] '+JSON.stringify(x)))
  .catch(e=>{console.error('[EKODI][NATIVE-LOCALAI-CANARY] '+String(e?.message||'verification_failed').slice(0,100));process.exitCode=1;});
}
