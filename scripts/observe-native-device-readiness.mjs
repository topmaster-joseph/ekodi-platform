import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DEVICES_URL='https://ekodi.kr/api/control/devices/readiness';
const HEARTBEAT_MAX_AGE_MS=90_000;
const norm=value=>String(value||'').trim().toLowerCase();

export function summarizeNativeDeviceReadiness(devices,{hostname='user3',now=Date.now()}={}){
  const target=norm(hostname);
  if(!/^[a-z0-9-]{2,48}$/.test(target))throw new Error('invalid_target_hostname');
  const matching=(Array.isArray(devices)?devices:[]).filter(device=>
    norm(device?.hostname)===target && device?.revokedAt==null &&
    device?.management?.source==='agent' && device?.management?.type==='pc' &&
    /win/i.test(String(device.platform||''))
  );
  const recent=matching.filter(device=>{
    const seen=Date.parse(String(device.lastSeenAt||''));
    return device.status==='online' && Number.isFinite(seen) &&
      seen<=now+5000 && now-seen>=0 && now-seen<=HEARTBEAT_MAX_AGE_MS;
  });
  const ready=recent.sort((a,b)=>Date.parse(b.lastSeenAt)-Date.parse(a.lastSeenAt))[0];
  return {
    schemaVersion:1,
    mode:'observe-only',
    targetAlias:target,
    registered:matching.length>0,
    heartbeatHealthy:Boolean(ready),
    verificationState:ready?'NATIVE_AGENT_HEARTBEAT_OBSERVED':
      matching.length?'NATIVE_AGENT_REGISTERED_NOT_ONLINE':'NATIVE_AGENT_NOT_REGISTERED',
    capabilities:{
      backgroundBrowser:ready?.capabilities?.backgroundBrowser===true,
      backgroundBrowserCanary:ready?.capabilities?.backgroundBrowserCanary===true,
      isolatedDesktop:ready?.capabilities?.isolatedDesktop===true,
      isolatedDesktopProbe:ready?.capabilities?.isolatedDesktopProbe===true,
      agentStatus:ready?.capabilities?.agentStatus===true,
      localAiInstall:ready?.capabilities?.localAiInstall===true
    },
    nativeCutoverVerified:false,
    remoteCommandIssued:false,
    observedAt:new Date(now).toISOString()
  };
}

export async function observeNativeDeviceReadiness({token,hostname='user3',now=Date.now(),fetchImpl=fetch}={}){
  if(!token||typeof token!=='string'||token.trim().length<20)throw new Error('trusted_admin_session_required');
  const target=norm(hostname);
  if(!/^[a-z0-9-]{2,48}$/.test(target))throw new Error('invalid_target_hostname');
  const url=DEVICES_URL+'?hostname='+encodeURIComponent(target);
  const response=await fetchImpl(url,{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{authorization:'Bearer '+token,accept:'application/json'},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error('native_agent_observation_http_'+response.status);
  const data=await response.json();
  if(!Array.isArray(data?.devices))throw new Error('native_agent_observation_invalid_response');
  return summarizeNativeDeviceReadiness(data.devices,{hostname,now});
}

// Read-only multi-device observation; no command POST, no alternate-device success substitution.
export async function observeNativeDeviceReadinessFleet({
  token, hostnames=['user3','user4'], now=Date.now(), fetchImpl=fetch
}={}){
  if(typeof token!=='string'||token.trim().length<20)throw new Error('trusted_admin_session_required');
  if(!Array.isArray(hostnames)||hostnames.length<1||hostnames.length>2)throw new Error('invalid_fleet_targets');
  const targets=hostnames.map(norm);
  if(new Set(targets).size!==targets.length || targets.some(target=>!/^[a-z0-9-]{2,48}$/.test(target)))
    throw new Error('invalid_fleet_targets');
  const observations=await Promise.allSettled(targets.map(hostname=>
    observeNativeDeviceReadiness({token,hostname,now,fetchImpl})
  ));
  return {
    schemaVersion:1,mode:'observe-only',remoteCommandIssued:false,
    targets:observations.map((observation,i)=>observation.status==='fulfilled'
      ? observation.value
      : {
          schemaVersion:1,mode:'observe-only',targetAlias:targets[i],
          registered:false,heartbeatHealthy:false,
          verificationState:'NATIVE_AGENT_OBSERVATION_UNAVAILABLE',
          remoteCommandIssued:false,nativeCutoverVerified:false,
          observedAt:new Date(now).toISOString()
        }),
    observedAt:new Date(now).toISOString()
  };
}

async function main(){
  const target=process.env.DEVICE_TARGET_HOSTNAME||'user3';
  const hostnames=norm(target)==='user4'?['user4']:[target,'user4'];
  const fleet=await observeNativeDeviceReadinessFleet({
    token:process.env.E2E_ADMIN_TOKEN,hostnames
  });
  const primary=fleet.targets[0];
  if(primary.verificationState==='NATIVE_AGENT_OBSERVATION_UNAVAILABLE')
    throw new Error('native_primary_observation_unavailable');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const dir=path.join(root,'artifacts');
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'native-device-readiness.json'),JSON.stringify(primary,null,2)+'\n');
  console.log('[EKODI][NATIVE-DEVICE-OBSERVE] '+JSON.stringify(primary));
  const user4=fleet.targets.find(result=>result.targetAlias==='user4');
  if(user4){
    await fs.writeFile(path.join(dir,'native-user4-readiness.json'),JSON.stringify(user4,null,2)+'\n');
    console.log('[EKODI][NATIVE-USER4-OBSERVE] '+JSON.stringify(user4));
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    console.error('[EKODI][NATIVE-DEVICE-OBSERVE] '+String(error?.message||'observation_failed').slice(0,130));
    process.exitCode=1;
  });
}
