import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function selectUser2SafeRoute({readiness={},probe={}}={}){
  const live=readiness.targetAlias==='user2' && readiness.heartbeatHealthy===true;
  const hyperVReady=live && probe.targetAlias==='user2' && probe.receiptStatus==='succeeded' && probe.backendReady===true;
  // An actual browser canary proof is mandatory; capability flags alone never unlock a fallback.
  const browserReady=live && readiness.capabilities?.backgroundBrowser===true &&
    readiness.capabilities?.backgroundBrowserCanary===true &&
    readiness.proofs?.browser?.verified===true &&
    readiness.proofs?.browser?.fresh===true &&
    readiness.proofs?.browser?.status==='succeeded';
  const common={schemaVersion:1,targetAlias:'user2',externalProviderUsed:false,
    preservesUserDesktop:true,hostClipboardShared:false,userInputInjection:false,
    desktopBackendReady:hyperVReady,browserAlternativeReady:browserReady,
    observedAt:new Date().toISOString()};
  if(hyperVReady)return {...common,ok:true,routeKind:'isolated-desktop-backend-ready',
    route:'ekodi-native-remote-computer',sessionExecutionAuthorized:false,
    reason:'additional_guest_ui_session_canaries_required',
    supportedTaskClasses:['isolated-desktop-readiness-verification'],
    unsupportedTaskClasses:['unbounded-desktop-execution']};
  if(browserReady)return {...common,ok:true,routeKind:'non-disruptive-browser-alternative',
    route:'ekodi-background-browser-worker',sessionExecutionAuthorized:false,
    reason:String(probe.gapReason||'native-capability-not-production-ready'),
    supportedTaskClasses:['browser-ui-validation','isolated-browser-execution'],
    unsupportedTaskClasses:['isolated-desktop-execution','full-computer-use','unbounded-desktop-execution']};
  return {...common,ok:false,routeKind:'blocked',route:null,sessionExecutionAuthorized:false,
    reason:live?'no_verified_native_execution_backend':'user2_native_agent_not_healthy',
    supportedTaskClasses:[],
    unsupportedTaskClasses:['isolated-desktop-execution','isolated-browser-execution','full-computer-use']};
}
async function main(){
 const dir=path.join(root,'artifacts');
 const readiness=JSON.parse(await fs.readFile(path.join(dir,'native-device-readiness.json'),'utf8'));
 let probe={targetAlias:'user2',backendReady:false,gapReason:'native-capability-not-production-ready'};
 try{probe=JSON.parse(await fs.readFile(path.join(dir,'native-user2-virtual-probe.json'),'utf8'));}catch{}
 const route=selectUser2SafeRoute({readiness,probe});
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'native-user2-safe-route.json'),JSON.stringify(route,null,2)+'\n');
 console.log('[EKODI][USER2-NATIVE-SAFE-ROUTE] '+JSON.stringify(route));
 if(!route.ok)process.exitCode=1;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error('[EKODI][USER2-NATIVE-SAFE-ROUTE] '+String(e.message||e).slice(0,120));process.exitCode=1;});

// Owner-triggered canonical protected CI convergence; no runtime behavior changed.
