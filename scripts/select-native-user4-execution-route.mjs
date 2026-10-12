import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectVirtualizationProvider} from '../virtualization-router.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

// Native USER4 recovery is advisory only. Never mutate Windows features,
// create a VM, touch the current desktop or schedule a reboot from a probe.
export function planUser4VirtualDesktopRecovery({probe={},now=Date.now()}={}) {
  if(probe?.targetAlias!=='user4' || probe?.receiptStatus!=='succeeded'){
    return {state:'PROBE_REQUIRED',targetAlias:'user4',automaticHostChanges:false,
      automaticReboot:false,missing:['current-user4-native-probe'],
      nextAction:'run-native-user4-readonly-probe'};
  }
  const when=Date.parse(String(probe.completedAt||''));
  if(!Number.isFinite(when)||when>now||now-when>10*60*1000){
    return {state:'PROBE_STALE',targetAlias:'user4',automaticHostChanges:false,
      automaticReboot:false,missing:['fresh-user4-native-probe'],
      nextAction:'refresh-native-user4-readonly-probe'};
  }
  const missing=[];
  if(probe.virtualizationFirmwareEnabled!==true)missing.push('firmware-virtualization');
  if(probe.hyperVState!=='Enabled')missing.push('hyper-v-windows-feature');
  if(probe.hyperVPowerShellAvailable!==true)missing.push('hyper-v-powershell-management');
  if(probe.baseVmPresent!==true)missing.push('ekodi-isolated-base-vm');
  if(probe.backendReady===true && missing.length===0 && probe.userDesktopAttached===false){
    return {state:'READY',targetAlias:'user4',automaticHostChanges:false,
      automaticReboot:false,missing:[],nextAction:'run-native-isolated-desktop-canary'};
  }
  const nextAction=missing.includes('firmware-virtualization')
    ? 'inspect-firmware-virtualization-with-local-owner'
    : missing.includes('hyper-v-windows-feature')
      ? 'verify-windows-edition-and-plan-admin-maintenance'
      : missing.includes('hyper-v-powershell-management')
        ? 'verify-hyper-v-management-tools'
        : 'prepare-and-verify-ekodi-base-vm-with-approval';
  return {state:'REQUIRES_MAINTENANCE',targetAlias:'user4',
    automaticHostChanges:false,automaticReboot:false,
    preservesUserDesktop:true,requiresSeparateAdminApproval:true,
    missing,nextAction};
}
export function selectUser4ExecutionRoute({readiness={},probe={},now=Date.now()}={}) {
  // Source-bound and age-bounded: another PC or an old receipt cannot activate
  // the USER4 native browser fallback or the headless Hyper-V route.
  const fresh=(value,maxAge)=>{
    const time=Date.parse(String(value||''));
    return Number.isFinite(time) && time<=now && now-time<=maxAge;
  };
  const user4Observed=readiness?.targetAlias==='user4'
    && readiness?.heartbeatHealthy===true
    && fresh(readiness?.observedAt,5*60*1000);
  const proof=readiness?.proofs?.browser;
  const browserReady=user4Observed
    && readiness?.capabilities?.backgroundBrowser===true
    && readiness?.capabilities?.backgroundBrowserCanary===true
    && proof?.status==='succeeded'
    && proof?.verified===true && proof?.fresh===true
    && fresh(proof?.completedAt,24*60*60*1000);
  const hyperVReady=user4Observed
    && probe?.targetAlias==='user4'
    && probe?.receiptStatus==='succeeded'
    && probe?.backendReady===true
    && probe?.userDesktopAttached===false
    && probe?.virtualizationFirmwareEnabled===true
    && probe?.hyperVState==='Enabled'
    && probe?.hyperVPowerShellAvailable===true
    && probe?.baseVmPresent===true
    && fresh(probe?.completedAt,10*60*1000);

  if(hyperVReady){
    return {
      ok:true,
      targetAlias:'user4',
      requestedCapability:'isolated-desktop-execution',
      route:'ekodi-native-remote-computer',
      routeKind:'isolated-desktop',
      desktopBackendReady:true,
      browserAlternativeReady:browserReady,
      recoveryPlan:planUser4VirtualDesktopRecovery({probe,now}),
      fallback:false,
      gapReason:null,
      observedAt:new Date().toISOString()
    };
  }

  if(browserReady){
    const selection=selectVirtualizationProvider({
      taskClass:'isolated-browser-execution',
      nativeProviders:[
        {id:'ekodi-background-browser-worker',ownership:'ekodi',state:'runtime-proven',ready:true,healthy:true,taskClasses:['isolated-browser-execution']},
        {id:'ekodi-native-remote-computer',ownership:'ekodi',state:'degraded',ready:false,healthy:false,taskClasses:['isolated-browser-execution']},
        {id:'autonomous-execution-fabric',ownership:'ekodi',state:'runtime-proven',ready:true,healthy:true,taskClasses:['isolated-browser-execution']}
      ]
    });
    if(!selection.ok) throw new Error('user4_safe_native_browser_route_unavailable');
    return {
      ok:true,
      targetAlias:'user4',
      requestedCapability:'isolated-desktop-execution',
      route:selection.providerId,
      routeKind:'non-disruptive-browser-alternative',
      desktopBackendReady:false,
      browserAlternativeReady:true,
      fallback:false,
      gapReason:String(probe?.gapReason||'native-capability-not-production-ready'),
      preservesUserDesktop:true,
      externalProviderUsed:false,
      supportedTaskClasses:['browser-ui-validation','synthetic-surface-verification','isolated-browser-execution'],
      unsupportedTaskClasses:['isolated-desktop-execution','computer-use-automation'],
      recoveryPlan:planUser4VirtualDesktopRecovery({probe,now}),
      observedAt:new Date().toISOString()
    };
  }

  throw new Error('user4_no_safe_native_execution_route');
}

async function main(){
  const artifacts=path.join(root,'artifacts');
  const readiness=JSON.parse(await fs.readFile(path.join(artifacts,'native-user4-readiness.json'),'utf8'));
  let probe={backendReady:false,gapReason:'native-capability-not-production-ready'};
  try{probe=JSON.parse(await fs.readFile(path.join(artifacts,'native-user4-virtual-probe.json'),'utf8'));}catch{}
  const result=selectUser4ExecutionRoute({readiness,probe});
  await fs.writeFile(path.join(artifacts,'native-user4-execution-route.json'),JSON.stringify(result,null,2)+'\n','utf8');
  console.log('[EKODI][USER4-EXECUTION-ROUTE] '+JSON.stringify(result));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    console.error('[EKODI][USER4-EXECUTION-ROUTE] '+String(error?.message||'route_selection_failed').slice(0,130));
    process.exitCode=1;
  });
}
