// WORKER-LANE-GRAPH-001 (2026-10-24): token-mediated merges emit no main push
// event, so a Worker is redeployed only if convergence dispatches its lane. The
// hand-written file lists in converge-orchestrated-pr-merge.mjs missed shared
// modules: config/user-footer.js changed on 10-20/10-22 and 17 service Workers
// kept serving the old legal footer. Lanes are therefore derived from each
// production Worker's static import graph and checked against
// config/worker-deploy-lanes.json, which names every Worker's deploy workflow.
import fs from 'node:fs';
import path from 'node:path';

export const WORKER_LANES_FILE='config/worker-deploy-lanes.json';
export const RELEASE_INPUTS=Object.freeze(['release_branch_ref','release_task_id']);

// `local` is deliberately absent: wrangler.local-commerce.toml is a production Worker.
const NON_PRODUCTION=/(?:^|[.-])(?:staging|preview|dev|development|build|bootstrap)(?:[.-]|$)/i;
const IMPORT_RE=/(?:^|[\n;])\s*(?:import|export)\s[^'"`;]*?\sfrom\s*['"](\.{1,2}\/[^'"]+)['"]|(?:^|[\n;])\s*import\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

const rel=(root,file)=>path.relative(root,file).split(path.sep).join('/');

// Production Worker configs at the repository root: wrangler.<name>.toml with a
// `main` entry and no staging/preview/dev/build marker in the file name.
export function listProductionWorkers(root){
  return fs.readdirSync(root)
    .filter(file=>/^wrangler(?:\.[a-z0-9-]+)*\.toml$/i.test(file)&&!NON_PRODUCTION.test(file.replace(/^wrangler\.?|\.toml$/gi,'')))
    .map(file=>{
      const source=fs.readFileSync(path.join(root,file),'utf8');
      const name=(source.match(/^name\s*=\s*"([^"]+)"/m)||[])[1]||'';
      const main=(source.match(/^main\s*=\s*"([^"]+)"/m)||[])[1]||'';
      return {config:file,name,main};
    })
    .filter(worker=>worker.name&&worker.main&&fs.existsSync(path.join(root,worker.main)))
    .sort((a,b)=>a.config.localeCompare(b.config));
}

function resolveImport(from,spec){
  const base=path.resolve(path.dirname(from),spec);
  for(const candidate of [base,base+'.js',base+'.mjs',path.join(base,'index.js')]){
    try{if(fs.statSync(candidate).isFile())return candidate}catch{}
  }
  return null;
}

// Repo-relative files statically reachable from a Worker entry (entry included).
export function bundleClosure(root,entry,cache=new Map()){
  const start=path.resolve(root,entry);
  const seen=new Set([start]);
  const stack=[start];
  while(stack.length){
    const file=stack.pop();
    let deps=cache.get(file);
    if(!deps){
      deps=[];
      let source='';
      try{source=fs.readFileSync(file,'utf8')}catch{}
      for(const match of source.matchAll(IMPORT_RE)){
        const resolved=resolveImport(file,match[1]||match[2]||match[3]);
        if(resolved)deps.push(resolved);
      }
      cache.set(file,deps);
    }
    for(const dep of deps)if(!seen.has(dep)){seen.add(dep);stack.push(dep)}
  }
  return new Set([...seen].map(file=>rel(root,file)));
}

export function readWorkerLanes(root){
  const parsed=JSON.parse(fs.readFileSync(path.join(root,WORKER_LANES_FILE),'utf8'));
  return parsed?.workers&&typeof parsed.workers==='object'?parsed.workers:{};
}

// Inputs declared under `on.workflow_dispatch.inputs` (empty when not dispatchable).
export function workflowDispatchInputs(root,workflow){
  let source='';
  try{source=fs.readFileSync(path.join(root,'.github/workflows',workflow),'utf8')}catch{return null}
  const block=source.match(/^ {2}workflow_dispatch:[^\n]*\n((?: {4,}.*\n|\s*\n)*)/m);
  if(!block)return null;
  const inputs=block[1].match(/^ {4}inputs:\s*\n((?: {6,}.*\n|\s*\n)*)/m);
  if(!inputs)return [];
  return [...inputs[1].matchAll(/^ {6}([A-Za-z0-9_-]+):/gm)].map(match=>match[1]);
}

// Workers whose bundle contains a changed file, with the lane that redeploys them.
// `dispatches` is one entry per workflow with its extra (non-receipt) inputs.
export function lanesForChangedFiles(root,changedFiles,{workers=listProductionWorkers(root),lanes=readWorkerLanes(root)}={}){
  const changed=new Set((changedFiles||[]).map(file=>String(file).replace(/\\/g,'/')));
  const cache=new Map();
  const affected=[];
  for(const worker of workers){
    const closure=bundleClosure(root,worker.main,cache);
    const touched=[...closure].filter(file=>changed.has(file));
    if(changed.has(worker.config))touched.push(worker.config);
    if(!touched.length)continue;
    const lane=lanes[worker.config]||null;
    affected.push({...worker,touched:touched.sort(),workflow:lane?.workflow||null,excluded:lane?.workflow?null:(lane?.excluded||null)});
  }
  const dispatches=new Map();
  for(const item of affected){
    if(!item.workflow||dispatches.has(item.workflow))continue;
    const extra=lanes[item.config]?.inputs;
    dispatches.set(item.workflow,{workflow:item.workflow,inputs:extra&&typeof extra==='object'?{...extra}:{}});
  }
  const unowned=affected.filter(item=>!item.workflow&&!item.excluded);
  return {affected,dispatches:[...dispatches.values()].sort((a,b)=>a.workflow.localeCompare(b.workflow)),unowned};
}

// Top-level jobs of a workflow as {name, ifLine, body}.
function workflowJobs(source){
  const jobsAt=source.search(/^jobs:\s*$/m);
  if(jobsAt<0)return [];
  const lines=source.slice(jobsAt).split('\n').slice(1);
  const jobs=[];
  let current=null;
  for(const line of lines){
    const head=line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if(head){current={name:head[1],ifLine:'',body:[]};jobs.push(current);continue}
    if(/^\S/.test(line))break;
    if(!current)continue;
    current.body.push(line);
    const cond=line.match(/^ {4}if:\s*(.+)$/);
    if(cond)current.ifLine=cond[1];
  }
  return jobs.map(job=>({...job,body:job.body.join('\n')}));
}

const RELEASE_GATE=/validate-ekodi-ai-change-orchestration\.mjs"?\s+--release/;

// Problems that stop a dispatched run from passing the release gate and reaching production.
export function laneWorkflowProblems(root,workflow){
  let source='';
  try{source=fs.readFileSync(path.join(root,'.github/workflows',workflow),'utf8')}catch{return [`${workflow} is missing`]}
  const problems=[];
  const inputs=workflowDispatchInputs(root,workflow);
  if(inputs===null)problems.push(`${workflow} has no workflow_dispatch trigger`);
  else{
    const missing=RELEASE_INPUTS.filter(input=>!inputs.includes(input));
    if(missing.length)problems.push(`${workflow} does not accept ${missing.join(', ')}`);
  }
  const workflowEnv=(source.match(/^env:\s*\n((?: {2,}.*\n?)*)/m)||[])[1]||'';
  const receiptInWorkflowEnv=/EKODI_RELEASE_BRANCH_REF/.test(workflowEnv);
  for(const job of workflowJobs(source)){
    if(!RELEASE_GATE.test(job.body))continue;
    // A pull-request-only job never runs on a dispatched release.
    if(/github\.event_name\s*==\s*'pull_request'/.test(job.ifLine)&&!/workflow_dispatch/.test(job.ifLine))continue;
    const jobEnv=(job.body.match(/^ {4}env:\s*\n((?: {6,}.*\n?)*)/m)||[])[1]||'';
    const exportsReceipt=/EKODI_RELEASE_BRANCH_REF=[^\n]*GITHUB_ENV/.test(job.body);
    const steps=job.body.split(/\n(?= {6}- )/);
    const unwired=steps.some(step=>RELEASE_GATE.test(step)&&!/EKODI_RELEASE_BRANCH_REF/.test(step));
    if(unwired&&!receiptInWorkflowEnv&&!/EKODI_RELEASE_BRANCH_REF/.test(jobEnv)&&!exportsReceipt)
      problems.push(`${workflow} job ${job.name} runs the --release gate without EKODI_RELEASE_BRANCH_REF`);
    if(/github\.event_name\s*==\s*'push'/.test(job.ifLine)&&!/workflow_dispatch/.test(job.ifLine))
      problems.push(`${workflow} job ${job.name} only reaches production on push; a dispatched release never deploys`);
  }
  return problems;
}

// Whole-repository contract: every production Worker names a dispatchable lane
// that accepts the orchestrator release receipt, or an explicit exclusion reason.
export function validateWorkerLanes(root){
  const workers=listProductionWorkers(root);
  const lanes=readWorkerLanes(root);
  const errors=[];
  for(const worker of workers){
    const lane=lanes[worker.config];
    if(!lane){errors.push(`${worker.config} (${worker.name}) has no entry in ${WORKER_LANES_FILE}`);continue}
    if(lane.excluded){
      if(String(lane.excluded).trim().length<12)errors.push(`${worker.config} exclusion needs a reason`);
      continue;
    }
    for(const problem of laneWorkflowProblems(root,String(lane.workflow||'')))errors.push(`${worker.config}: ${problem}`);
  }
  const known=new Set(workers.map(worker=>worker.config));
  for(const config of Object.keys(lanes))if(!known.has(config))errors.push(`${WORKER_LANES_FILE} lists unknown production Worker ${config}`);
  return {ok:errors.length===0,errors,workers:workers.length};
}
