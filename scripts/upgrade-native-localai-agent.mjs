import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Transactional, receipt-gated, one-time USER3 native Agent upgrade.
// Never performs arbitrary commands, model installation, browser automation, or pairing.
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DEVICE_API='https://ekodi.kr/api/control/devices';
const COMMAND='agent.self_update';
const norm=x=>String(x||'').trim().toLowerCase();
const date=x=>Date.parse(String(x||''));
const wait=ms=>new Promise(done=>setTimeout(done,ms));

export function agentVersionFromSource(content){
  const m=String(content||'').match(/\$AgentVersion\s*=\s*'([0-9]+\.[0-9]+\.[0-9]+)'/);
  if(!m)throw new Error('native_agent_source_version_missing');
  return m[1];
}
export function shouldUpgrade(current,expected){
  const cv=String(current||'').split('.').map(Number),ev=String(expected||'').split('.').map(Number);
  if(cv.length!==3||ev.length!==3||[...cv,...ev].some(x=>!Number.isSafeInteger(x)||x<0))
    throw new Error('native_agent_version_invalid');
  for(let i=0;i<3;i++){if(cv[i]<ev[i])return true;if(cv[i]>ev[i])return false;}
  return false;
}
export function eligibleUpgradeAgent(device,{hostname='user3',now=Date.now()}={}){
  const seen=date(device?.lastSeenAt);
  return Boolean(norm(device?.hostname)===norm(hostname) &&
    device?.status==='online' && device?.revokedAt==null &&
    device?.management?.source==='agent' && device?.management?.type==='pc' &&
    /win/i.test(String(device?.platform||'')) &&
    device?.capabilities?.agentStatus===true &&
    Number.isFinite(seen)&&now-seen>=0&&now-seen<=90000);
}
export async function upgradeNativeAgent({
  token,hostname='user3',expectedVersion,fetchImpl=fetch,clock=()=>Date.now(),
  sleepFn=wait,maxPoll=70,pollMs=5000
}={}){
  if(typeof token!=='string'||token.trim().length<20)throw new Error('trusted_admin_session_required');
  const target=norm(hostname);
  if(!/^[a-z0-9-]{2,48}$/.test(target))throw new Error('invalid_target_hostname');
  const expected=String(expectedVersion||'');
  if(!/^\d+\.\d+\.\d+$/.test(expected))throw new Error('trusted_expected_agent_version_required');
  async function request(url,method='GET',body){
    const res=await fetchImpl(url,{
      method,redirect:'error',cache:'no-store',
      headers:{authorization:'Bearer '+token,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000)
    });
    const d=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error('native_agent_upgrade_http_'+res.status);
    return d;
  }
  async function devices(){
    const data=await request(DEVICE_API);
    if(!Array.isArray(data?.devices))throw new Error('native_agent_upgrade_invalid_response');
    return data.devices;
  }
  const first=(await devices()).filter(d=>eligibleUpgradeAgent(d,{hostname:target,now:clock()}))
    .sort((a,b)=>date(b.lastSeenAt)-date(a.lastSeenAt))[0];
  if(!first||typeof first.id!=='string'||!first.id)throw new Error('no_healthy_registered_user3');
  const current=String(first.agentVersion||'');
  if(first.capabilities?.localAiVerify===true){
    return {schemaVersion:1,targetAlias:target,upgrade:'not_needed',
      currentAgentVersion:current,expectedAgentVersion:expected,localAiVerify:true,
      remoteCommandIssued:false,cloudAiNodePaired:false};
  }
  if(!shouldUpgrade(current,expected))throw new Error('native_localai_capability_missing_on_current_agent');
  const existing=(first.recentCommands||[]).find(c=>c.type===COMMAND &&
    ['queued','claimed'].includes(c.status)&&Number.isFinite(date(c.issuedAt))&&
    clock()-date(c.issuedAt)>=0&&clock()-date(c.issuedAt)<120000);
  let cmd=existing;
  if(!cmd){
    const data=await request(DEVICE_API+'/'+encodeURIComponent(first.id)+'/commands','POST',
      {type:COMMAND,confirmed:true});
    cmd=data.command;
    if(cmd?.type!==COMMAND||typeof cmd?.id!=='string'||!cmd.id||cmd.status!=='queued')
      throw new Error('native_agent_upgrade_enqueue_invalid');
  }
  for(let attempt=0;attempt<maxPoll;attempt++){
    if(attempt>0)await sleepFn(pollMs);
    const d=(await devices()).find(x=>x.id===first.id);
    const receipt=(d?.recentCommands||[]).find(x=>x.id===cmd.id);
    if(['failed','cancelled'].includes(receipt?.status))throw new Error('native_agent_transaction_'+receipt.status);
    if(receipt?.status!=='succeeded')continue;
    const message=String(receipt.result?.message||'');
    if(!message.includes('트랜잭션')||!message.includes(expected))
      throw new Error('native_agent_missing_transaction_proof');
    if(!eligibleUpgradeAgent(d,{hostname:target,now:clock()})||d.agentVersion!==expected||
       d.capabilities?.localAiVerify!==true||date(d.lastSeenAt)<date(cmd.issuedAt))
      continue;
    return {schemaVersion:1,targetAlias:target,upgrade:'completed',commandId:cmd.id,
      receiptStatus:'succeeded',previousAgentVersion:current,newAgentVersion:expected,
      localAiVerify:true,heartbeatAfterUpgrade:true,transactionalRollbackProtected:true,
      cloudAiNodePaired:false,remoteCommandIssued:true,observedAt:new Date(clock()).toISOString()};
  }
  throw new Error('native_agent_upgrade_heartbeat_timeout');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const content=fs.readFileSync(path.join(ROOT,'tools/ekodi-device-agent/windows/ekodi-device-agent.ps1'),'utf8');
  const expectedVersion=agentVersionFromSource(content);
  upgradeNativeAgent({token:process.env.E2E_ADMIN_TOKEN,expectedVersion,hostname:process.env.DEVICE_TARGET_HOSTNAME||'user3'})
    .then(x=>console.log('[EKODI][NATIVE-AGENT-UPDATE] '+JSON.stringify(x)))
    .catch(e=>{console.error('[EKODI][NATIVE-AGENT-UPDATE] '+String(e?.message||'update_failed').slice(0,130));process.exitCode=1;});
}
