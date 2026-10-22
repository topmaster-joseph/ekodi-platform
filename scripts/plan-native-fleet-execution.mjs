import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Planning is strictly read-only. The authenticated Device Control command plane
// remains the only authority to issue per-device, approved work.
const MAX_OBSERVATION_AGE_MS=5*60*1000;
const MAX_PROOF_AGE_MS=24*60*60*1000;

const recent=(timestamp,maxAge,now)=>{
  const t=Date.parse(String(timestamp||''));
  return Number.isFinite(t) && t<=now && now-t<=maxAge;
};
const readyHeartbeat=(item,name,now)=>item?.targetAlias===name &&
  item?.registered===true && item?.heartbeatHealthy===true &&
  item?.verificationState==='NATIVE_AGENT_HEARTBEAT_OBSERVED' &&
  recent(item?.observedAt,MAX_OBSERVATION_AGE_MS,now);
const validProof=(item,now)=>item?.status==='succeeded' &&
  item?.verified===true && item?.fresh===true &&
  recent(item?.completedAt,MAX_PROOF_AGE_MS,now);

export function planNativeFleetExecution({user3,user4,now=Date.now()}={}){
  const ai=readyHeartbeat(user3,'user3',now) &&
    user3?.capabilities?.localAiVerify===true &&
    validProof(user3?.proofs?.localAi,now);
  const browser=readyHeartbeat(user4,'user4',now) &&
    user4?.capabilities?.backgroundBrowser===true &&
    user4?.capabilities?.backgroundBrowserCanary===true &&
    validProof(user4?.proofs?.browser,now);

  return {
    schemaVersion:1,
    mode:'observe-and-plan-only',
    fleet:'EKODI-native',
    observedAt:new Date(now).toISOString(),
    hostDesktopAccessAuthorized:false,
    cloudAccountPairingVerified:false,
    remoteCommandsIssued:false,
    authorityGranted:false,
    lanes:{
      localAI:{
        owner:'user3',
        selectedProvider:ai?'ekodi-native-localai-node':null,
        eligible:ai,
        state:ai?'fresh-native-receipt':'fresh-localai-canary-required',
        allowedTaskClasses:['local-ai-diagnostics','local-ai-inference'],
        disallowedTaskClasses:['desktop-control','remote-shell','user-browser-control']
      },
      browser:{
        owner:'user4',
        selectedProvider:browser?'ekodi-background-browser-worker':null,
        eligible:browser,
        state:browser?'fresh-native-receipt':'fresh-background-browser-canary-required',
        allowedTaskClasses:['browser-ui-validation','isolated-browser-execution'],
        disallowedTaskClasses:['isolated-desktop-execution','full-computer-use','interactive-login']
      }
    },
    isolatedDesktopExecutionReady:false,
    nextAction:!ai?'renew-approved-user3-localai-receipt':
      !browser?'renew-approved-user4-background-browser-canary':
      'submit-narrowly-authorized-per-device-jobs-to-existing-command-plane'
  };
}

async function main(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const dir=path.join(root,'artifacts');
  const file=async name=>JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
  const user3=await file('native-device-readiness.json');
  // Non-USER3 mode is an independent task; never substitute USER2 as AI or browser proof.
  if(user3.targetAlias!=='user3'){
    console.log('[EKODI][FLEET-ROUTE] skipped_non_user3_observation');
    return;
  }
  const user4=await file('native-user4-readiness.json');
  const plan=planNativeFleetExecution({user3,user4});
  await fs.writeFile(path.join(dir,'native-fleet-route.json'),JSON.stringify(plan,null,2)+'\n');
  console.log('[EKODI][FLEET-ROUTE] '+JSON.stringify(plan));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    console.error('[EKODI][FLEET-ROUTE] '+String(error?.message||'planning_failed').slice(0,120));
    process.exitCode=1;
  });
}
