#!/usr/bin/env node
// WORKER-LANE-GRAPH-001: every production Worker must have a dispatchable,
// receipt-aware deploy lane (or a recorded exclusion), so a token-mediated merge
// that changes any module in its bundle can actually redeploy it.
// Usage: node scripts/validate-worker-deploy-lanes.mjs [--changed file1,file2]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanesForChangedFiles, validateWorkerLanes, workflowDispatchCallProblems } from './lib/worker-bundle-graph.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const result=validateWorkerLanes(root);
const dispatchProblems=workflowDispatchCallProblems(root);
if(!result.ok||dispatchProblems.length){
  for(const error of result.errors)console.error(`[WORKER-LANE-GRAPH-001] ${error}`);
  for(const problem of dispatchProblems)console.error(`[CONTROL-API-DISPATCH-RECEIPT-001] ${problem}`);
  process.exit(1);
}
const changedArg=process.argv.indexOf('--changed');
if(changedArg>0){
  const changed=String(process.argv[changedArg+1]||'').split(',').map(file=>file.trim()).filter(Boolean);
  const plan=lanesForChangedFiles(root,changed);
  console.log(JSON.stringify({dispatches:plan.dispatches,affected:plan.affected.map(({config,name,workflow,excluded,touched})=>({config,name,workflow,excluded,touched}))},null,2));
  if(plan.unowned.length)process.exit(1);
}else{
  console.log(`Worker deploy lanes valid: ${result.workers} production Workers each have a receipt-aware lane or a recorded exclusion.`);
}
