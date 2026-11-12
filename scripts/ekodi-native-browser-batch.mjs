// EKODI Native Browser v2: amortize Chromium startup across a bounded,
// canonical-origin batch. No external browser provider, session import,
// arbitrary JS, checkout, or third-party navigation.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {normalizeTask,runTask} from './ekodi-background-browser-worker.mjs';

const MAX_SURFACES=12;
const safeName=value=>String(value||'native-batch').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,90)||'native-batch';

export function planNativeBrowserBatch(raw={}) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw Error('NATIVE_BATCH_INVALID');
  const entries=raw.paths;
  if(!Array.isArray(entries)||!entries.length||entries.length>MAX_SURFACES)throw Error('NATIVE_BATCH_PATH_COUNT');
  if(raw.allowMutation===true)throw Error('NATIVE_BATCH_MUTATION_FORBIDDEN');
  const paths=[];
  for(const value of entries){
    if(typeof value!=='string' || value.length>256)throw Error('NATIVE_BATCH_PATH_INVALID');
    // This enforces the existing ekodi.kr-only policy, no redirects, no userinfo.
    const p=normalizeTask({path:value,actions:[]}).path;
    if(!paths.includes(p))paths.push(p);
  }
  // Optional public-brand assertions are read-only and run in the actual
  // owned Chromium DOM after each corresponding navigation. Never accept an
  // assertion for an unrequested path or a value that could carry credentials.
  const assertionInput=raw.expectedTextByPath;
  if(assertionInput!==undefined && (!assertionInput || typeof assertionInput!=='object' || Array.isArray(assertionInput)))
    throw Error('NATIVE_BATCH_ASSERTIONS_INVALID');
  const assertions=new Map();
  for(const [requestedPath,label] of Object.entries(assertionInput||{})){
    if(typeof requestedPath!=='string' || !requestedPath.startsWith('/'))
      throw Error('NATIVE_BATCH_ASSERTION_PATH_INVALID');
    const normalized=normalizeTask({path:requestedPath,actions:[]}).path;
    if(normalized!==requestedPath || !paths.includes(normalized))
      throw Error('NATIVE_BATCH_ASSERTION_PATH_UNREQUESTED');
    if(typeof label!=='string'||label!==label.trim()||
      !/^[\p{L}\p{N} .·&()_-]{2,80}$/u.test(label) ||
      /(?:password|bearer|token|secret|cookie|authkey)/i.test(label))
      throw Error('NATIVE_BATCH_ASSERTION_TEXT_INVALID');
    assertions.set(normalized,label);
  }
  const profile=String(raw.deviceProfile||'desktop');
  // Validate profile through the same centrally enforced task contract.
  normalizeTask({path:'/',deviceProfile:profile,actions:[]});
  // Existing task protocol allows at most 30 actions. Keep every snapshot
  // and every requested text assertion; only screenshots can be budgeted down.
  const actionBase=(2*paths.length-1)+assertions.size;
  if(actionBase>30)throw Error('NATIVE_BATCH_ACTION_BUDGET_EXCEEDED');
  const screenshotBudget=raw.screenshots===true?Math.min(paths.length,30-actionBase):0;
  let remaining=screenshotBudget;
  const actions=[];
  paths.forEach((p,i)=>{
    if(i>0)actions.push({type:'goto',path:p});
    actions.push({type:'snapshot'});
    if(assertions.has(p))actions.push({type:'assertText',text:assertions.get(p)});
    if(remaining>0){actions.push({type:'screenshot',name:'surface-'+i,fullPage:true});remaining--;}
  });
  const task=normalizeTask({
    taskId:safeName(raw.taskId),path:paths[0],deviceProfile:profile,
    allowMutation:false,actions,timeoutMs:Math.min(Number(raw.timeoutMs)||120000,120000)
  });
  return Object.freeze({task,requestedPaths:entries.length,uniquePaths:paths.length,
    expectedTextByPath:Object.freeze(Object.fromEntries(assertions)),
    assertionsPlanned:assertions.size,screenshotsPlanned:screenshotBudget,
    chromiumLaunches:1,externalBrowserCalls:0});
}

export async function runNativeBrowserBatch(raw, options={}){
  const plan=planNativeBrowserBatch(raw);
  const runner=options.runner||runTask;
  const started=Date.now();
  const report=await runner(plan.task,{...(options.artifactRoot?{artifactRoot:options.artifactRoot}:{})});
  if(!report||report.ok!==true||report.virtualizationProvider!=='ekodi-background-browser-worker')
    throw Error('NATIVE_BATCH_WORKER_NOT_VERIFIED');
  return {
    ok:true,taskId:plan.task.taskId,provider:'ekodi-background-browser-worker',
    performance:report.performance||null,elapsedMs:Date.now()-started,
    pathsChecked:plan.uniquePaths,chromiumLaunches:1,externalBrowserCalls:0,
    assertionsPlanned:plan.assertionsPlanned,
    screenshotsPlanned:plan.screenshotsPlanned,workerReport:report
  };
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const file=process.argv[2];
  if(!file)throw Error('NATIVE_BATCH_FILE_REQUIRED');
  const raw=JSON.parse(await readFile(path.resolve(file),'utf8'));
  runNativeBrowserBatch(raw).then(result=>{process.stdout.write(JSON.stringify(result)+'\n')})
    .catch(err=>{process.stderr.write(JSON.stringify({ok:false,code:/^NATIVE_[A-Z0-9_]+$/.test(err.message)?err.message:'NATIVE_BATCH_FAILED'})+'\n');process.exitCode=1});
}
