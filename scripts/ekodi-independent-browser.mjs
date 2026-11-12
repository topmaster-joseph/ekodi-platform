// EKODI native-only browser execution. Never depends on a paid browser
// account, external provider quota, imported cookies, or a vendor session.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {planNativeBrowserBatch,runNativeBrowserBatch} from './ekodi-native-browser-batch.mjs';
import {INTERACTIVE_AUTH_SERVICES} from '../interactive-auth-session.js';

const fail=(code)=>Object.freeze({ok:false,code,provider:'ekodi-owned',externalBrowserCalls:0,paidBrowserRequired:false});
const SUCCESS_PROVIDER='ekodi-background-browser-worker';

export function planEkodiIndependentBrowser(request={},environment={}) {
  if(!request||typeof request!=='object'||Array.isArray(request))return fail('EKODI_BROWSER_REQUEST_INVALID');
  // External account credentials must only be entered by a human at the
  // protected on-device EKODI interactive-auth session.
  if(request.kind==='external-auth'){
    const service=String(request.service||'');
    if(!Object.hasOwn(INTERACTIVE_AUTH_SERVICES,service))return fail('EKODI_AUTH_SERVICE_UNREGISTERED');
    if(environment.nativeAgentReady!==true)return fail('EKODI_NATIVE_AGENT_REQUIRED');
    if(environment.localConsentConfirmed!==true)return fail('EKODI_HUMAN_LOGIN_CONSENT_REQUIRED');
    return Object.freeze({ok:true,provider:'ekodi-native-remote-computer',mode:'interactive-local-consent',
      service,action:'OPEN_REGISTERED_EKODI_AUTH_SESSION',externalBrowserCalls:0,
      paidBrowserRequired:false,credentialsRelay:false,automatedPurchase:false});
  }
  if(request.kind&&request.kind!=='public-readonly')return fail('EKODI_BROWSER_TASK_UNSUPPORTED');
  if(request.allowMutation===true||request.credentials||request.cookies||request.vendorToken)
    return fail('EKODI_BROWSER_MUTATION_OR_SECRET_FORBIDDEN');
  let batch;
  try {
    batch=planNativeBrowserBatch({
      taskId:request.taskId||'ekodi-native',
      paths:request.paths||[request.path||'/'],deviceProfile:request.deviceProfile||'desktop',
      screenshots:request.screenshots===true,allowMutation:false,timeoutMs:request.timeoutMs,
      expectedTextByPath:request.expectedTextByPath
    });
  } catch {return fail('EKODI_BROWSER_TASK_VALIDATION_FAILED');}
  if(environment.cloudRuntimeReady===false)return fail('EKODI_NATIVE_CLOUD_RUNTIME_REQUIRED');
  return Object.freeze({
    ok:true,provider:SUCCESS_PROVIDER,mode:'cloud-native-readonly',
    action:'EXECUTE_NATIVE_CHROMIUM_BATCH',plan:batch,
    deviceAgentRequired:false,externalBrowserCalls:0,paidBrowserRequired:false,
    credentialsRelay:false,automatedPurchase:false
  });
}

export async function executeEkodiIndependentBrowser(request,environment={},options={}) {
  const selection=planEkodiIndependentBrowser(request,environment);
  if(!selection.ok)return selection;
  if(selection.mode!=='cloud-native-readonly')return selection;
  try{
    // Runner is the EKODI-owned local Playwright/Chromium worker; no automatic
    // migration to any external browser provider if the native runner fails.
    const result=await runNativeBrowserBatch({
      taskId:selection.plan.task.taskId,paths:[selection.plan.task.path,
        ...selection.plan.task.actions.filter(x=>x.type==='goto').map(x=>x.path)],
      deviceProfile:selection.plan.task.deviceProfile,
      screenshots:selection.plan.screenshotsPlanned>0,
      expectedTextByPath:selection.plan.expectedTextByPath,
      timeoutMs:selection.plan.task.timeoutMs
    },{...(options.runner?{runner:options.runner}:{}),
      ...(options.artifactRoot?{artifactRoot:options.artifactRoot}:{})});
    return {ok:true,provider:SUCCESS_PROVIDER,externalBrowserCalls:0,paidBrowserRequired:false,
      performance:result.performance,receipt:result};
  }catch{
    // Do not disclose browser errors containing user/authorization URLs.
    return fail('EKODI_NATIVE_BROWSER_EXECUTION_FAILED');
  }
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const {readFile}=await import('node:fs/promises');
  try{
    const filename=process.argv[2];
    if(!filename)throw Error('missing task');
    const request=JSON.parse(await readFile(path.resolve(filename),'utf8'));
    const result=await executeEkodiIndependentBrowser(request);
    process.stdout.write(JSON.stringify(result)+'\n');
    if(!result.ok)process.exitCode=1;
  }catch{
    process.stderr.write(JSON.stringify(fail('EKODI_BROWSER_REQUEST_INVALID'))+'\n');
    process.exitCode=1;
  }
}
