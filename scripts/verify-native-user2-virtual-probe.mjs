// Receipt-gated, read-only USER2 native Hyper-V readiness probe; never touches user desktop.
const API='https://ekodi.kr/api/control/devices';
const COMMAND='computer.desktop.probe';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const parse=t=>Date.parse(String(t||''));
async function run(){
 const token=String(process.env.E2E_ADMIN_TOKEN||'');
 if(token.length<20)throw Error('trusted_admin_session_required');
 async function req(path,method='GET',body){
  const r=await fetch(API+path,{method,redirect:'error',cache:'no-store',
   headers:{authorization:'Bearer '+token,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('api_http_'+r.status);
  return r.json();
 }
 const devices=async()=>{const d=await req('');if(!Array.isArray(d.devices))throw Error('device_contract');return d.devices;};
 const list=await devices();
 const choices=list.filter(d=>String(d.hostname||'').toLowerCase()==='user2'&&
  d.revokedAt==null&&d.status==='online'&&d.management?.source==='agent'&&
  d.management?.type==='pc'&&/win/i.test(String(d.platform||''))&&
  Number.isFinite(parse(d.lastSeenAt))&&Date.now()-parse(d.lastSeenAt)>=0&&Date.now()-parse(d.lastSeenAt)<=90000)
  .sort((a,b)=>parse(b.lastSeenAt)-parse(a.lastSeenAt));
 const device=choices[0];
 if(!device?.id)throw Error('user2_native_agent_not_healthy');
 const existing=(device.recentCommands||[]).find(c=>c.type===COMMAND&&
  ['queued','claimed'].includes(c.status)&&Number.isFinite(parse(c.issuedAt))&&
  Date.now()-parse(c.issuedAt)>=0&&Date.now()-parse(c.issuedAt)<120000);
 const out=existing|| (await req('/'+encodeURIComponent(device.id)+'/commands','POST',{type:COMMAND,payload:{},confirmed:false})).command;
 if(!out?.id)throw Error('probe_command_not_queued');
 for(let i=0;i<24;i++){
  if(i)await sleep(4000);
  const current=(await devices()).find(d=>d.id===device.id);
  const c=(current?.recentCommands||[]).find(x=>x.id===out.id);
  if(c?.status==='failed'||c?.status==='cancelled')throw Error('probe_'+c.status);
  if(c?.status!=='succeeded')continue;
  const proof=c.result?.desktopProbe;
  if(!proof)throw Error('missing_native_hyperv_probe');
  console.log('[EKODI][USER2-NATIVE-VIRTUAL-PROBE] '+JSON.stringify({
    targetAlias:'user2',commandId:out.id,receiptStatus:'succeeded',
    backendReady:proof.headlessBackendReady===true,
    backend:'hyper-v-ekodi-base',userDesktopAttached:false,
    virtualizationFirmwareEnabled:proof.virtualizationFirmwareEnabled===true,
    hyperVState:['Enabled','Disabled','EnablePending','DisablePending'].includes(proof.hyperVState)?proof.hyperVState:'unknown',
    hyperVPowerShellAvailable:proof.hyperVPowerShellAvailable===true,
    baseVmPresent:proof.baseVmPresent===true,
    gapReason:['native-capability-unavailable','native-capability-not-production-ready','required-capability-not-yet-implemented','native-capacity-or-runtime-failure'].includes(proof.gapReason)?proof.gapReason:'unknown',
    completedAt:c.completedAt||null,observedAt:new Date().toISOString()}));
  if(proof.headlessBackendReady!==true)throw Error('user2_hyperv_backend_not_ready');
  return;
 }
 throw Error('user2_native_probe_timeout');
}
run().catch(e=>{console.error('[EKODI][USER2-NATIVE-VIRTUAL-PROBE] '+String(e.message).slice(0,110));process.exitCode=1;});

// Canonical Orchestrator owner-authored protected validation trigger.
