import fs from 'node:fs';
import path from 'node:path';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { explainFourLayerFallback } from '../deployment-layer-router.js';

function bool(value, fallback=false){
  if(value===undefined||value===null||value==='')return fallback;
  if(typeof value==='boolean')return value;
  return ['1','true','yes','on'].includes(String(value).trim().toLowerCase());
}
function argMap(argv=process.argv.slice(2)){
  const map=new Map();
  for(const token of argv){
    if(!token.startsWith('--'))continue;
    const [key,...rest]=token.slice(2).split('=');
    map.set(key,rest.length?rest.join('='):'true');
  }
  return map;
}
function quotaState(report){
  const state=String(report?.state||'unknown').trim().toLowerCase();
  return ['normal','warning','protect','exhausted'].includes(state)?state:'unknown';
}
export function resolveDeploymentContinuity(input={}){
  const state=quotaState(input.quotaReport);
  const runtimeQuotaExhausted=state==='exhausted';
  const choice=explainFourLayerFallback({
    intent:input.intent||'code_release',
    codeChange:input.codeChange!==false,
    securityCritical:bool(input.securityCritical,false),
    runtimeSupported:bool(input.runtimeSupported,false),
    guardedDeployAvailable:input.guardedDeployAvailable!==false,
    githubActionsWranglerAvailable:input.githubActionsWranglerAvailable!==false,
    cloudControlAuthorized:bool(input.cloudControlAuthorized,false),
    cloudControlAllowlisted:bool(input.cloudControlAllowlisted,false),
    runtimeQuotaExhausted,
    workersBuildsExhausted:bool(input.workersBuildsExhausted,false),
    ownerApproval:bool(input.ownerApproval,false),
  });
  let releaseAction='proceed';
  let promotionAllowed=choice.choice.allowed!==false;
  let verificationMode=state==='protect'?'essential-only':'full';
  let resumeCondition=null;
  if(choice.choice.layer==='guarded-deploy'&&runtimeQuotaExhausted){
    releaseAction='prepare-and-hold';
    promotionAllowed=false;
    verificationMode='none-live';
    resumeCondition='cloudflare-workers-runtime-quota-reset';
  }else if(choice.choice.layer==='runtime'&&runtimeQuotaExhausted){
    releaseAction='safe-runtime-degrade';
    verificationMode='static-cache-only';
  }else if(choice.choice.layer==='owner'){
    releaseAction='owner-decision';
    promotionAllowed=false;
    verificationMode='none-live';
    resumeCondition='fresh-owner-approval';
  }else if(choice.choice.layer==='cloud-control'){
    releaseAction='repair-then-return-to-guarded-deploy';
    promotionAllowed=false;
    verificationMode='repair-only';
    resumeCondition='cloud-control-postcondition-verified';
  }
  return Object.freeze({
    schemaVersion:1,
    policyId:choice.policyId,
    selectedLayer:choice.choice.layer,
    selectedRank:choice.choice.rank,
    selectionReason:choice.choice.reason,
    releaseAction,
    promotionAllowed,
    verificationMode,
    runtimeQuotaState:state,
    runtimeQuotaExhausted,
    resumeCondition,
    automaticPaidUpgrade:false,
    preserveSecurityBoundary:true,
    preparedBeforeHold:releaseAction==='prepare-and-hold'
      ? ['ci','staging','immutable-release-artifact','artifact-continuity-evidence']
      : [],
  });
}
async function main(){
  const args=argMap();
  let quotaReport={state:'unknown'};
  const quotaPath=String(args.get('quota-report')||'').trim();
  if(quotaPath){
    if(!fs.existsSync(quotaPath))throw new Error('DEPLOYMENT_CONTINUITY_QUOTA_REPORT_MISSING');
    quotaReport=JSON.parse(fs.readFileSync(quotaPath,'utf8'));
  }
  const result=resolveDeploymentContinuity({
    intent:args.get('intent')||'code_release',
    codeChange:bool(args.get('code-change'),true),
    securityCritical:bool(args.get('security-critical'),false),
    runtimeSupported:bool(args.get('runtime-supported'),false),
    guardedDeployAvailable:bool(args.get('guarded-deploy-available'),true),
    githubActionsWranglerAvailable:bool(args.get('github-actions-wrangler-available'),true),
    cloudControlAuthorized:bool(args.get('cloud-control-authorized'),false),
    cloudControlAllowlisted:bool(args.get('cloud-control-allowlisted'),false),
    workersBuildsExhausted:bool(args.get('workers-builds-exhausted'),false),
    ownerApproval:bool(args.get('owner-approval'),false),
    quotaReport,
  });
  const output=String(args.get('output')||'').trim();
  if(output){
    fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n','utf8');
  }
  if(process.env.GITHUB_OUTPUT){
    const values={
      selected_layer:result.selectedLayer,
      selected_rank:result.selectedRank,
      release_action:result.releaseAction,
      promotion_allowed:String(result.promotionAllowed),
      verification_mode:result.verificationMode,
      runtime_quota_state:result.runtimeQuotaState,
      resume_condition:result.resumeCondition||'',
    };
    await appendFile(process.env.GITHUB_OUTPUT,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n','utf8');
  }
  if(process.env.GITHUB_STEP_SUMMARY){
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### EKODI 4-layer deployment continuity\n- Layer: **${result.selectedRank} · ${result.selectedLayer}**\n- Action: **${result.releaseAction}**\n- Runtime quota: **${result.runtimeQuotaState}**\n- Promotion allowed now: **${result.promotionAllowed?'yes':'no'}**\n- Verification mode: **${result.verificationMode}**\n${result.resumeCondition?`- Resume condition: **${result.resumeCondition}**\n`:''}`,
      'utf8');
  }
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error?.stack||error);process.exit(1)});
