// EKODI official Orchestrator-only USER2 no-restart Hyper-V activation acceptance.
// Every step uses the authenticated Device Control D1 queue, not external desktop commands.
const ROOT='https://ekodi.kr/api/control/devices';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const live=d=>d&&String(d.hostname||'').trim().toLowerCase()==='user2'&&d.revokedAt==null&&d.status==='online'&&d.management?.source==='agent'&&d.management?.type==='pc'&&/win/i.test(String(d.platform||''))&&Number.isFinite(Date.parse(d.lastSeenAt||''))&&Date.now()-Date.parse(d.lastSeenAt)>=0&&Date.now()-Date.parse(d.lastSeenAt)<=90000;
async function main(){
 const token=process.env.E2E_ADMIN_TOKEN;
 if(typeof token!=='string'||token.length<20)throw Error('genuine_admin_session_required');
 const req=async (route='',method='GET',body)=>{
  const r=await fetch(ROOT+route,{method,redirect:'error',cache:'no-store',
   headers:{authorization:'Bearer '+token,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('device_api_http_'+r.status);
  return r.json();
 };
 const devices=async()=>{const r=await req();if(!Array.isArray(r.devices))throw Error('devices_contract_invalid');return r.devices;};
 const pick=async id=>{const ds=await devices();return id?ds.find(d=>d.id===id):ds.filter(live).sort((a,b)=>Date.parse(b.lastSeenAt)-Date.parse(a.lastSeenAt))[0];};
 const first=await pick();
 if(!first?.id)throw Error('user2_native_agent_not_healthy');
 const id=first.id;
 async function command(type,confirmed){
  const d=await pick(id);
  if(!live(d))throw Error('user2_native_agent_heartbeat_lost');
  if((d.recentCommands||[]).some(c=>['queued','claimed'].includes(c.status)))throw Error('user2_other_command_in_flight');
  const data=await req('/'+encodeURIComponent(id)+'/commands','POST',{type,confirmed});
  const cmd=data.command;
  if(cmd?.type!==type||typeof cmd.id!=='string'||cmd.status!=='queued')throw Error('command_enqueue_failed');
  for(let n=0;n<45;n++){
   if(n)await sleep(4000);
   const current=await pick(id);
   if(!current||current.revokedAt!=null)throw Error('user2_registration_lost');
   const receipt=(current.recentCommands||[]).find(c=>c.id===cmd.id);
   if(receipt?.status==='failed'||receipt?.status==='cancelled')throw Error(type.replaceAll('.','_')+'_'+receipt.status);
   if(receipt?.status==='succeeded')return {commandId:cmd.id,receipt};
  }
  throw Error(type.replaceAll('.','_')+'_timeout');
 }
 const update=await command('agent.self_update',true);
 // Self-update restarts only EKODI Agent, not Windows; require a genuine renewed heartbeat.
 await sleep(5000);
 let ready=false;
 for(let i=0;i<20;i++){
  const d=await pick(id);
  if(live(d)){ready=true;break;}
  await sleep(4000);
 }
 if(!ready)throw Error('user2_agent_not_returned_after_update');
 const pre=await command('computer.hyperv.preflight',false);
 const preflight=pre.receipt.result?.hyperVPreparation;
 if(!preflight||preflight.targetAlias!=='user2'||preflight.featureEnableRequested!==false)
  throw Error('preflight_proof_invalid');
 if(!preflight.administrator)throw Error('user2_elevation_required');
 if(!preflight.firmwareVirtualizationEnabled)throw Error('user2_firmware_virtualization_not_ready');
 if(!['Disabled','Enabled','EnablePending'].includes(preflight.hyperVState))
  throw Error('user2_hyperv_feature_unavailable');
 const activation=await command('computer.hyperv.enable',true);
 const proof=activation.receipt.result?.hyperVPreparation;
 if(!proof||proof.targetAlias!=='user2'||proof.featureEnableRequested!==true||proof.rebootPerformed!==false||
 !['Enabled','EnablePending'].includes(proof.hyperVState)||proof.guestExecutionAuthorized!==false)
  throw Error('activation_receipt_invalid');
 console.log('[EKODI][USER2-HYPERV-NO-RESTART] '+JSON.stringify({
  targetAlias:'user2',agentUpdateCommandId:update.commandId,
  preflightCommandId:pre.commandId,enableCommandId:activation.commandId,
  realAgentReceipts:true,hyperVState:proof.hyperVState,
  hyperVModuleAvailable:proof.hyperVModuleAvailable===true,
  baseVmPresent:proof.baseVmPresent===true,rebootPerformed:false,
  rebootMayBeRequired:proof.rebootMayBeRequired===true,
  guestExecutionAuthorized:false,
  observedAt:new Date().toISOString()
 }));
}
main().catch(e=>{console.error('[EKODI][USER2-HYPERV-NO-RESTART] '+String(e.message).slice(0,140));process.exitCode=1;});

// Owner-authorized guarded convergence for exact USER2 maintenance release.
