// EKODI first-party staging metadata producer; no owner authorization.
// This never proves production rollback readiness and must never deploy.
// The exact application bytes were checked by verify-staged-application-identity.
import fs from 'node:fs';
import path from 'node:path';
import {verifyStagedApplicationIdentity} from './verify-staged-application-identity.mjs';

const TASK=/^orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const BRANCH=/^ai\/[a-z0-9][a-z0-9._-]{0,31}\/orch_[a-z0-9][a-z0-9_-]{15,120}$/i;
const SHA=/^[0-9a-f]{40}$/i;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const fail=message=>{throw new Error('EKODI_STAGING_EVIDENCE_'+message)};

export function makeEkodiStagingEvidence({
  taskId,branchRef,sourceSha,applicationDigest,stagingUrl,
  verifiedAt=new Date().toISOString(),
}={}){
  if(!TASK.test(taskId||'')||!BRANCH.test(branchRef||'')||
     !branchRef.endsWith('/'+taskId))fail('OFFICIAL_TASK_AND_BRANCH_REQUIRED');
  if(!SHA.test(sourceSha||'')||!DIGEST.test(applicationDigest||''))fail('EXACT_APPLICATION_REQUIRED');
  let u;
  try{u=new URL(stagingUrl)}catch{fail('STAGING_ENDPOINT_REQUIRED')}
  if(u.protocol!=='https:'||!u.hostname.endsWith('.workers.dev')||
     u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)fail('STAGING_ENDPOINT_INVALID');
  if(!Number.isFinite(Date.parse(verifiedAt))||Math.abs(Date.now()-Date.parse(verifiedAt))>15*60*1000){
    fail('STALE_VERIFICATION_TIMESTAMP');
  }
  const artifactName=`ekodi-staging-pending-${taskId}-sha256-${applicationDigest.slice(7)}`;
  const record=Object.freeze({
    schemaVersion:1,authority:'ekodi-staging-metadata-only',
    taskId,branchRef,sourceSha,applicationDigest,stagingUrl:u.toString(),
    verifiedAt,stagingEnvironment:'development',
    appBytesVerified:true,rollbackReady:false,
    ownerApproved:false,releaseAuthorized:false,productionDeployed:false,
  });
  return Object.freeze({artifactName,record});
}

export function writeEkodiStagingEvidence({
  root=process.cwd(),taskId,branchRef,sourceSha,applicationDigest,stagingUrl,
  outputPath=process.env.GITHUB_OUTPUT,
}={}){
  if(!path.isAbsolute(root))fail('INVALID_ROOT');
  verifyStagedApplicationIdentity({root,sourceSha,expectedDigest:applicationDigest});
  const {artifactName,record}=makeEkodiStagingEvidence({
    taskId,branchRef,sourceSha,applicationDigest,stagingUrl,
  });
  const folder=path.join(root,'.release','preproduction-evidence',artifactName);
  fs.mkdirSync(folder,{recursive:true});
  const filename=path.join(folder,'staging-metadata.json');
  fs.writeFileSync(filename,JSON.stringify(record,null,2)+'\n',{mode:0o644});
  if(outputPath){
    fs.appendFileSync(outputPath,`artifact_name=${artifactName}\n`);
    fs.appendFileSync(outputPath,`artifact_path=${folder}\n`);
  }
  return Object.freeze({artifactName,artifactPath:folder,record,productionDeployed:false});
}

if(process.argv.includes('--write')){
  try{
    const done=writeEkodiStagingEvidence({
      taskId:process.env.EKODI_RELEASE_TASK_ID,
      branchRef:process.env.EKODI_RELEASE_BRANCH_REF,
      sourceSha:process.env.GITHUB_SHA,
      applicationDigest:process.env.EXPECTED_AI_ARTIFACT_DIGEST,
      stagingUrl:process.env.EKODI_STAGING_URL,
    });
    console.log(`EKODI staging-only metadata archived: ${done.artifactName}`);
  }catch(error){
    console.error(String(error?.message||error));
    process.exitCode=1;
  }
}
