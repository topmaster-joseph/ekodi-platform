#!/usr/bin/env node
// EKODI staged Site Core release: recover exactly one Cloudflare API 10500 internal
// secrets-read error. CF-QUOTA-001: NEVER retry 429/1027 or a rate/quota response.
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const STAGING_INTERNAL_AUTH_RETRY_DELAY_MS=18000;
export const MAX_STAGING_DEPLOY_ATTEMPTS=2;
const QUOTA_RESPONSE=/\b(?:HTTP\s*)?429\b|\b(?:error\s*)?1027\b|\bquota (?:circuit|exhausted)\b|\btoo many requests\b|\brate.limit(?:ed|ing)\b/i;
const TRANSIENT_SECRETS_10500=/workers\/scripts\/[a-z0-9-]+\/secrets[\s\S]{0,800}?internal authentication error:\s*internal server error\s*\[code:\s*10500\]/i;

export function mayRetryStaging10500(output){
  const body=String(output??'');
  return !QUOTA_RESPONSE.test(body)&&TRANSIENT_SECRETS_10500.test(body);
}

export async function runStagingWith10500Recovery({
  run, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  log=message=>console.warn(message),
}){
  if(typeof run!=='function')throw new TypeError('staging run callback required');
  const first=await run();
  if(first?.code===0)return {ok:true,attempts:1,internalAuthRecovered:false};
  if(!mayRetryStaging10500(first?.output)){
    throw new Error('Site Core staging deploy failed; not eligible for 10500-only recovery (CF-QUOTA-001 fail-closed)');
  }
  log('[EKODI][STAGING-10500] Cloudflare internal secrets-read error; one guarded staging retry after fixed delay');
  await sleep(STAGING_INTERNAL_AUTH_RETRY_DELAY_MS);
  const second=await run();
  if(second?.code!==0){
    throw new Error(
      'Site Core staging retry failed; no further attempts or production promotion' +
      (mayRetryStaging10500(second?.output)?' (Cloudflare 10500 persisted)':' (other error or quota circuit)')
    );
  }
  return {ok:true,attempts:MAX_STAGING_DEPLOY_ATTEMPTS,internalAuthRecovered:true};
}

function runPinnedWranglerStaging(version){
  return new Promise((resolve,reject)=>{
    let output='';
    const args=['--yes','wrangler@'+version,'deploy','--config','wrangler.site-staging.toml'];
    const child=spawn('npx',args,{stdio:['ignore','pipe','pipe'],shell:false});
    const write=(stream,chunk)=>{
      const part=chunk.toString('utf8');
      stream.write(part);
      // Bound retained diagnostic text; no token values are passed as argv.
      output=(output+part).slice(-24000);
    };
    child.stdout.on('data',part=>write(process.stdout,part));
    child.stderr.on('data',part=>write(process.stderr,part));
    child.once('error',reject);
    child.once('close',code=>resolve({code:code??1,output}));
  });
}

async function main(){
  const version=process.env.WRANGLER_VERSION;
  if(!/^4\.\d+\.\d+$/.test(version||''))throw new Error('Missing pinned 4.x Wrangler version');
  await runStagingWith10500Recovery({run:()=>runPinnedWranglerStaging(version)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(err=>{console.error('[EKODI][STAGING-10500] '+err.message);process.exitCode=1;});
}
