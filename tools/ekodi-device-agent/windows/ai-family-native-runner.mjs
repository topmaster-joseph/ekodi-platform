/**
 * Non-elevated EKODI native AI family worker — opt-in runtime library.
 * No polling, credential retrieval, browser automation, remote commands or
 * production registration are performed by this module.
 * Only an independently authenticated, non-elevated consent broker may call it.
 */
import { spawn as nativeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile as nativeReadFile } from 'node:fs/promises';
import {
  inspectLocalFamilyClaim, planReadOnlyFamilyInvocation,
  meteredApiFreeEnvironment, buildVerifiedFamilyReceipt,
} from './ai-family-sidecar-contract.mjs';

export const NATIVE_RUNNER_POLICY=Object.freeze({
  enabledByDefault:false, maximumPerLane:2, heartbeatIntervalMs:25_000,
  maxOutputChars:12_000, paidApiBudgetKrw:0, readOnly:true,
});
const error=code=>Object.freeze({ok:false,code});
const isHash=x=>/^[0-9a-f]{64}$/.test(String(x||''));
function keyOf(deviceId,provider){return [deviceId,provider].join(':');}

/** Explicit user-process runner. All security adapters are mandatory and must
 *  be supplied by a *trusted* local consent/identity service, not from job JSON.
 *  Adapters may be faked ONLY in tests. No real OS execution is initiated on
 *  missing, unsigned, expired, or unverifiable evidence. */
export function createNativeFamilyRunner(deps={}){
  const {
    getSignedConsent,verifySignedConsent,isNonElevatedWindowsUser,
    verifyCliOAuth,renewLease,terminateProcessTree,
  }=deps;
  const spawn=deps.spawn||nativeSpawn;
  const readFile=deps.readFile||nativeReadFile;
  const now=deps.now||Date.now;
  const platform=deps.platform||process.platform;
  const env=deps.env||process.env;
  const active=new Map();
  const heartbeatIntervalMs=deps.heartbeatIntervalMs||NATIVE_RUNNER_POLICY.heartbeatIntervalMs;
  if(!Number.isInteger(heartbeatIntervalMs)||heartbeatIntervalMs<50||heartbeatIntervalMs>30_000)
    throw new Error('INVALID_HEARTBEAT_INTERVAL');

  async function run(command,{deviceId,signal}={}){
    if(platform!=='win32')return error('WINDOWS_USER_MODE_REQUIRED');
    if(!deviceId||typeof deviceId!=='string')return error('DEVICE_ID_REQUIRED');
    if([getSignedConsent,verifySignedConsent,isNonElevatedWindowsUser,verifyCliOAuth,
      renewLease,terminateProcessTree].some(x=>typeof x!=='function'))return error('TRUSTED_BROKER_NOT_CONNECTED');
    const claim=inspectLocalFamilyClaim(command,now());
    if(!claim.ok)return claim;
    if(signal?.aborted)return error('ABORTED');
    const key=keyOf(deviceId,claim.provider);
    let jobs=active.get(key);
    if(!jobs){jobs=new Set();active.set(key,jobs);}
    if(jobs.has(claim.jobId))return error('DUPLICATE_NATIVE_JOB');
    if(jobs.size>=NATIVE_RUNNER_POLICY.maximumPerLane)return error('LOCAL_LANE_SATURATED');
    jobs.add(claim.jobId);
    try{
      // Check the actual Windows token, not a boolean from a remote command.
      if(await isNonElevatedWindowsUser()!==true)return error('ELEVATED_IDENTITY_FORBIDDEN');
      const approval=await getSignedConsent({claim,deviceId});
      if(!approval||await verifySignedConsent(approval,{claim,deviceId})!==true)
        return error('SIGNED_CONSENT_REQUIRED');
      if(approval.jobId!==claim.jobId||approval.deviceId!==deviceId||
        approval.requestKey!==claim.requestKey)return error('CONSENT_JOB_BINDING_MISMATCH');
      const plan=planReadOnlyFamilyInvocation(claim,approval,now());
      if(!plan.ok)return plan;
      if(!isHash(approval.cliScriptSha256)||!isHash(approval.nodeExecutableSha256))
        return error('EXECUTABLE_HASH_REQUIRED');
      for(const [path,expected] of [
        [approval.cliScriptPath,approval.cliScriptSha256],
        [approval.nodeExecutable,approval.nodeExecutableSha256],
      ]){
        const actual=createHash('sha256').update(await readFile(path)).digest('hex');
        if(actual!==expected)return error('EXECUTABLE_HASH_MISMATCH');
      }
      if(await verifyCliOAuth(plan,{deviceId,claim})!==true)
        return error('OAUTH_SUBSCRIPTION_UNVERIFIED');
      // A fresh authenticated lease must be observed BEFORE launching a CLI.
      const issuedAt=Date.parse(command.issuedAt);
      const absoluteDeadline=issuedAt+claim.timeoutMs;
      let currentLease=Date.parse(command.leaseExpiresAt);
      let rearmDeadline=()=>{};
      async function refreshLease(){
        const response=await renewLease({jobId:claim.jobId,attempt:claim.attempt,deviceId});
        const expiry=Date.parse(String(response?.leaseExpiresAt||''));
        if(response?.ok!==true||!Number.isFinite(expiry)||expiry<=now())return false;
        currentLease=expiry;
        if(now()>=absoluteDeadline)return false;
        rearmDeadline();
        return true;
      }
      if(!await refreshLease())return error('LEASE_FENCE_REJECTED');
      if(signal?.aborted)return error('ABORTED');

      // The OS process is already proven non-elevated; no arbitrary command,
      // shell or paid API credentials are passed to the child.
      const child=spawn(plan.executable,plan.args,{
        cwd:plan.cwd,env:meteredApiFreeEnvironment(env),shell:false,
        windowsHide:true,stdio:['pipe','pipe','pipe'],detached:false,
      });
      if(!child||typeof child.once!=='function'||!child.stdout||!child.stdin)
        return error('NATIVE_PROCESS_UNAVAILABLE');
      const maxBytes=NATIVE_RUNNER_POLICY.maxOutputChars*4;
      let stopped=false,stopReason='',outBytes=0;
      const chunks=[];
      let finishExit;
      const exitPromise=new Promise(resolve=>{finishExit=resolve;});
      let processClosed=false;
      function finish(data){if(processClosed)return;processClosed=true;finishExit(data);}
      child.once('error',()=>finish({ok:false,code:'NATIVE_PROCESS_START_FAILED'}));
      child.once('close',(code,signalName)=>finish({ok:true,exitCode:code,signal:signalName}));
      child.stdout.on('data',data=>{
        const b=Buffer.isBuffer(data)?data:Buffer.from(data);
        outBytes+=b.length;
        if(outBytes>maxBytes){stopReason='OUTPUT_LIMIT_REACHED';void stop();return;}
        chunks.push(b);
      });
      // Do not collect stderr: auth errors and provider diagnostics may include
      // user/device secrets. Report only an opaque failure category.
      child.stderr?.on?.('data',()=>{});
      async function stop(){
        if(stopped)return;
        stopped=true;
        let terminated=false;
        try{terminated=await terminateProcessTree(child)===true;}catch{/* do not mask original failure */}
        try{child.kill?.('SIGKILL');}catch{}
        // An attested tree stop allows releasing the local slot even if an OS
        // child event is delayed. An unconfirmed stop stays pending (fail closed).
        if(terminated)finish({ok:false,code:stopReason||'ABORTED'});
      }
      const abort=()=>{stopReason='ABORTED';void stop();};
      signal?.addEventListener?.('abort',abort,{once:true});
      const interval=setInterval(async()=>{
        if(stopped||processClosed)return;
        if(now()>=absoluteDeadline||now()>=currentLease){stopReason='LEASE_OR_JOB_EXPIRED';await stop();return;}
        try{if(!await refreshLease()){stopReason='LEASE_FENCE_REJECTED';await stop();}}
        catch{stopReason='LEASE_HEARTBEAT_FAILED';await stop();}
      },heartbeatIntervalMs);
      interval.unref?.();
      let expiryTimer=null;
      rearmDeadline=()=>{
        if(expiryTimer)clearTimeout(expiryTimer);
        if(processClosed||stopped)return;
        const remaining=Math.min(absoluteDeadline,currentLease)-now();
        if(remaining<=0){stopReason='LEASE_OR_JOB_EXPIRED';void stop();return;}
        expiryTimer=setTimeout(()=>{if(!processClosed){stopReason='LEASE_OR_JOB_EXPIRED';void stop();}},remaining);
        expiryTimer.unref?.();
      };
      rearmDeadline();
      try{
        child.stdin.on?.('error',()=>{});
        child.stdin.end(claim.prompt+'\n');
        const outcome=await exitPromise;
        if(stopReason)return error(stopReason);
        if(!outcome.ok)return error(outcome.code);
        if(outcome.exitCode!==0)return error('NATIVE_CLI_FAILURE');
        if(!await refreshLease())return error('LEASE_FENCE_REJECTED');
        const output=Buffer.concat(chunks).toString('utf8').trim();
        const renewedClaim={...claim,deadlineMs:Math.min(currentLease,absoluteDeadline)};
        const receipt=buildVerifiedFamilyReceipt(renewedClaim,{
          exitCode:outcome.exitCode,fenced:true,authenticatedCli:true,output,
        },deviceId,now());
        return receipt.ok?Object.freeze({ok:true,receipt:receipt.receipt}):receipt;
      }finally{
        clearInterval(interval);clearTimeout(expiryTimer);
        signal?.removeEventListener?.('abort',abort);
      }
    }catch{return error('NATIVE_RUNNER_PRECHECK_FAILED');}
    finally{jobs.delete(claim.jobId);if(!jobs.size)active.delete(key);}
  }
  return Object.freeze({run,activeCount:()=>[...active.values()].reduce((sum,x)=>sum+x.size,0)});
}
