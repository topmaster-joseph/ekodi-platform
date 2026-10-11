import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectVirtualizationProvider} from '../virtualization-router.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export function selectUser4ExecutionRoute({readiness={},probe={}}={}) {
  const hyperVReady=probe?.backendReady===true;
  const browserReady=readiness?.heartbeatHealthy===true
    && readiness?.capabilities?.backgroundBrowser===true
    && readiness?.capabilities?.backgroundBrowserCanary===true
    && readiness?.proofs?.browser?.verified===true;

  if(hyperVReady){
    return {
      ok:true,
      targetAlias:'user4',
      requestedCapability:'isolated-desktop-execution',
      route:'ekodi-native-remote-computer',
      routeKind:'isolated-desktop',
      desktopBackendReady:true,
      browserAlternativeReady:browserReady,
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
