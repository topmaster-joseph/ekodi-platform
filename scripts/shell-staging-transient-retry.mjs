#!/usr/bin/env node
// Bounded Cloudflare API transport retry for isolated Shell staging only.
// Never retries auth, 429/1027, quota or arbitrary Wrangler errors; the
// production release still requires all guarded staging + provenance checks.
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const SHELL_STAGE_RETRY_DELAY_MS=18000;
export const SHELL_STAGE_MAX_ATTEMPTS=2;
const CONFIG='wrangler.shell.staging.toml';
const QUOTA_OR_PERMISSION=/\b(?:HTTP\s*)?(?:401|403|429)\b|\b(?:error\s*)?1027\b|\bquota (?:circuit|exhausted)\b|\btoo many requests\b|\brate limit(?:ed|ing)\b|\b(?:unauthorized|forbidden|invalid token|permission denied)\b/i;
const MALFORMED_RESPONSE=/received a malformed response from the API/i;
const RESET_BEFORE_HEADERS=/upstream connect error or disconnect\/reset before headers/i;

export function canRetryShellStageTransport(output){
  const body=String(output??'');
  return !QUOTA_OR_PERMISSION.test(body)&&MALFORMED_RESPONSE.test(body)&&RESET_BEFORE_HEADERS.test(body);
}

export async function runShellStageWithTransportRetry({
  run,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  log=message=>console.warn(message),
}){
  if(typeof run!=='function')throw new TypeError('staging run callback required');
  const first=await run();
  if(first?.code===0)return {ok:true,attempts:1,transportRecovered:false};
  if(!canRetryShellStageTransport(first?.output)){
    throw new Error('Shell staging failed; non-retryable or unknown error (CF-QUOTA-001 fail-closed)');
  }
  log('[EKODI][SHELL-STAGE] Cloudflare transient upstream reset; one delayed retry');
  await sleep(SHELL_STAGE_RETRY_DELAY_MS);
  const second=await run();
  if(second?.code!==0)throw new Error('Shell staging retry failed; stop without production promotion');
  return {ok:true,attempts:SHELL_STAGE_MAX_ATTEMPTS,transportRecovered:true};
}

function pinnedShellStaging(version){
  return new Promise((resolve,reject)=>{
    let output='';
    const args=['--yes','wrangler@'+version,'deploy','--config',CONFIG];
    const child=spawn('npx',args,{stdio:['ignore','pipe','pipe'],shell:false});
    const report=(stream,chunk)=>{
      const part=String(chunk);
      stream.write(part);
      output=(output+part).slice(-24000);
    };
    child.stdout.on('data',chunk=>report(process.stdout,chunk));
    child.stderr.on('data',chunk=>report(process.stderr,chunk));
    child.once('error',reject);
    child.once('close',code=>resolve({code:code??1,output}));
  });
}
async function main(){
  const version=process.env.WRANGLER_VERSION||'';
  if(!/^4\.\d+\.\d+$/.test(version))throw new Error('Pinned Wrangler 4.x version is required');
  await runShellStageWithTransportRetry({run:()=>pinnedShellStaging(version)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error('[EKODI][SHELL-STAGE] '+error.message);process.exitCode=1;});
}
