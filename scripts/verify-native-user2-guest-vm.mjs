// USER2-only official guest VM acceptance: real agent receipts, fail closed.
// Never installs Hyper-V, reboots host, creates base VM or touches user desktop.
import {observeNativeDeviceReadiness} from './observe-native-device-readiness.mjs';
const API='https://ekodi.kr/api/control/devices', sleep=ms=>new Promise(r=>setTimeout(r,ms));
const commands=[
 ['computer.desktop.probe','desktopProbe'],
 ['computer.desktop.canary','desktopCanary'],
 ['computer.desktop.guest.canary','desktopGuestCanary'],
 ['computer.desktop.ui.canary','desktopUiCanary'],
 ['computer.desktop.session.canary','desktopSessionCanary']
];
export async function verifyUser2GuestVm({token=process.env.E2E_ADMIN_TOKEN,fetchImpl=fetch,sleepFn=sleep,maxPoll=55,pollMs=4000}={}){
 if(typeof token!=='string'||token.length<20)throw Error('trusted_admin_session_required');
 const readiness=await observeNativeDeviceReadiness({token,hostname:'user2',fetchImpl});
 if(readiness.targetAlias!=='user2'||!readiness.heartbeatHealthy||readiness.capabilities?.isolatedDesktopProbe!==true)
  throw Error('user2_native_agent_not_ready');
 const request=async(path,method='GET',body)=>{
  const r=await fetchImpl(API+path,{method,redirect:'error',cache:'no-store',headers:{authorization:'Bearer '+token,accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('device_api_'+r.status);return r.json();
 };
 const list=async()=>{const r=await request('');if(!Array.isArray(r.devices))throw Error('invalid_device_list');return r.devices;};
 const eligible=(await list()).filter(d=>String(d.hostname||'').trim().toLowerCase()==='user2'&&d.status==='online'&&d.revokedAt==null&&d.management?.source==='agent'&&d.management?.type==='pc'&&/win/i.test(String(d.platform||''))&&Date.now()-Date.parse(d.lastSeenAt)>=0&&Date.now()-Date.parse(d.lastSeenAt)<=90000).sort((a,b)=>Date.parse(b.lastSeenAt)-Date.parse(a.lastSeenAt))[0];
 if(!eligible?.id)throw Error('user2_agent_registration_unavailable');
 const records=[];
 for(const [type,key] of commands){
  const current=(await list()).find(d=>d.id===eligible.id);
  if(!current||current.revokedAt||current.status!=='online'||Date.now()-Date.parse(current.lastSeenAt)>90000)throw Error('user2_heartbeat_lost');
  if((current.recentCommands||[]).some(c=>['queued','claimed'].includes(c.status)))throw Error('user2_active_command_conflict');
  const out=(await request('/'+encodeURIComponent(eligible.id)+'/commands','POST',{type,confirmed:type!=='computer.desktop.probe'})).command;
  if(out?.type!==type||!out?.id||out.status!=='queued')throw Error('command_enqueue_invalid');
  let proof=null;
  for(let n=0;n<maxPoll;n++){
   if(n)await sleepFn(pollMs);
   const now=(await list()).find(d=>d.id===eligible.id);
   const c=(now?.recentCommands||[]).find(c=>c.id===out.id);
   if(c?.status==='failed'||c?.status==='cancelled')throw Error('native_'+type.replaceAll('.','_')+'_failed');
   if(c?.status==='succeeded'){proof=c.result?.[key];break;}
  }
  if(!proof||proof.ok!==true)throw Error('missing_verified_'+key);
  // A successful command is insufficient without matching schema and exact canary stage.
  const expectedModes={
   desktopProbe:'isolated-desktop-backend-probe',
   desktopCanary:'isolated-desktop-hyperv-canary',
   desktopGuestCanary:'isolated-desktop-guest-runtime-canary',
   desktopUiCanary:'isolated-desktop-guest-ui-canary',
   desktopSessionCanary:'isolated-desktop-session-canary'
  };
  if(proof.mode!==expectedModes[key])throw Error('native_stage_mode_mismatch');
  if(type!=='computer.desktop.probe' && (
    proof.ok!==true || proof.headless!==true && type==='computer.desktop.canary'
  ))throw Error('native_guest_canary_invalid');
  if(type==='computer.desktop.probe'){
   if(proof.headlessBackendReady!==true){
    console.log('[EKODI][USER2-GUEST-VM-BLOCKED] '+JSON.stringify({hyperVState:proof.hyperVState,hyperVPowerShellAvailable:proof.hyperVPowerShellAvailable===true,baseVmPresent:proof.baseVmPresent===true,gapReason:proof.gapReason,commandsIssued:1,guestCommandsIssued:0}));
    throw Error('user2_hyperv_prerequisites_not_ready');
   }
  }else{
   if(proof.provider!=='ekodi-native-remote-computer'||proof.backend!=='hyper-v-ekodi-base'||
      proof.networkAttached!==false||proof.clipboardShared!==false||proof.userInputInjection!==false||
      proof.credentialCollection!==false||proof.sessionVmRemoved!==true||proof.sessionDiskRemoved!==true)
      throw Error('native_guest_isolation_receipt_invalid');
  }
  records.push({type,receiptStatus:'succeeded',mode:proof.mode||null,cleanupVerified:type==='computer.desktop.probe'?null:true});
 }
 return {targetAlias:'user2',ok:true,isolatedGuestCanariesPassed:true,unboundedDesktopExecutionAuthorized:false,commands:records};
}
if(process.argv[1]&&process.argv[1].endsWith('verify-native-user2-guest-vm.mjs'))
 verifyUser2GuestVm().then(r=>console.log('[EKODI][USER2-GUEST-VM-ACCEPTANCE] '+JSON.stringify(r))).catch(e=>{console.error('[EKODI][USER2-GUEST-VM-ACCEPTANCE] '+String(e.message).slice(0,110));process.exitCode=1;});

// Canonical protected CI trigger; isolated Guest VM remains disabled until real probe is ready.

// Owner-authored required check rerun after canonical base synchronization.
