/**
 * EKODI-owned external browser operator: isolated, provider-scoped YouTube adapter.
 * NOT the EKODI background browser worker, which remains canonical-origin and ephemeral.
 * Credentials and browser profile never leave the operator-controlled device.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

export const CGMA_YOUTUBE = Object.freeze({
  provider:'youtube-studio',
  channelId:'UC001JT9opxVBt9z_h-tsx8A',
  handle:'@cgma4989',
  publicUrl:'https://www.youtube.com/@cgma4989/live',
  studioUrl:'https://studio.youtube.com/',
});
export const MODES = Object.freeze(['public-check','session-verify','login-setup']);
const SETUP_HOSTS = new Set([
  'studio.youtube.com','www.youtube.com','youtube.com','accounts.google.com',
  'accounts.youtube.com','consent.youtube.com','myaccount.google.com',
]);
const TIMEOUT_MS = 30000;
const clean = (v,n=160)=>String(v ?? '').trim().slice(0,n);

export function profileDirectory(env=process.env,home=os.homedir()){
  const base=env.LOCALAPPDATA || path.join(home,'.local','share');
  return path.resolve(base,'EKODI','BrowserOperator','youtube-cgma4989');
}
export function normalizeOperation(raw={}){
  const mode=clean(raw.mode,40);
  if(!MODES.includes(mode)) throw Error('browser_operation_not_allowed');
  if(raw.channel && raw.channel!==CGMA_YOUTUBE.handle) throw Error('browser_channel_mismatch');
  if(raw.url || raw.script || raw.selector || raw.profilePath) throw Error('browser_arbitrary_target_forbidden');
  if(mode==='login-setup' && raw.interactiveConsent!==true) throw Error('browser_setup_explicit_consent_required');
  return Object.freeze({mode,provider:CGMA_YOUTUBE.provider,channelId:CGMA_YOUTUBE.channelId,
    target:mode==='public-check'?CGMA_YOUTUBE.publicUrl:CGMA_YOUTUBE.studioUrl,
    requiresLocalConsent:mode!=='public-check',readOnly:mode!=='login-setup'});
}
export function studioChannelIdentity(url){
  let u; try{u=new URL(url);}catch{return {trusted:false,matched:false,requiresLogin:false};}
  if(u.protocol!=='https:' || u.username || u.password || !SETUP_HOSTS.has(u.hostname)) return {trusted:false,matched:false,requiresLogin:false};
  if(u.hostname==='accounts.google.com' || u.hostname==='accounts.youtube.com') return {trusted:true,matched:false,requiresLogin:true};
  if(u.hostname!=='studio.youtube.com') return {trusted:true,matched:false,requiresLogin:false};
  const channel=u.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/)?.[1] || '';
  return {trusted:true,matched:channel===CGMA_YOUTUBE.channelId,requiresLogin:false};
}
function safeLocation(url){
  try{const u=new URL(url);return {origin:u.origin,pathname:u.pathname};}
  catch{return {origin:'',pathname:''};}
}
async function openPlaywright(){
  try{return (await import('playwright')).chromium;}
  catch{throw Error('playwright_not_installed: npm install --no-save --package-lock=false playwright@1.55.0');}
}
async function guardedNavigation(page){
  await page.route('**/*',async route=>{
    const request=route.request();
    if(!request.isNavigationRequest()) return route.continue();
    let main=false;
    try{main=request.frame()===page.mainFrame();}catch{}
    if(!main) return route.continue();
    try{const u=new URL(request.url());if(u.protocol==='https:' && SETUP_HOSTS.has(u.hostname) && !u.username && !u.password) return route.continue();}
    catch{}
    return route.abort('blockedbyclient');
  });
}
async function openContext(chromium,profile,interactive){
  return chromium.launchPersistentContext(profile,{
    channel:'chrome',headless:!interactive,acceptDownloads:false,
    viewport:{width:1280,height:840},
  });
}
const markerFile=profile=>path.join(profile,'.ekodi-authorized-channel.json');
export async function requireLocalAuthorization(profile){
  let value;
  try{value=JSON.parse(await fs.readFile(markerFile(profile),'utf8'));}catch{throw Error('browser_local_login_setup_required');}
  if(value?.provider!==CGMA_YOUTUBE.provider || value?.channelId!==CGMA_YOUTUBE.channelId || value?.approved!==true) throw Error('browser_local_login_setup_required');
  return true;
}
async function saveLocalAuthorization(profile){
  const data={provider:CGMA_YOUTUBE.provider,channelId:CGMA_YOUTUBE.channelId,approved:true,approvedAt:new Date().toISOString()};
  await fs.writeFile(markerFile(profile),JSON.stringify(data),{encoding:'utf8',mode:0o600,flag:'w'});
  await fs.chmod(markerFile(profile),0o600).catch(()=>{});
}
export async function runOwnedBrowser(raw={},options={}){
  const task=normalizeOperation(raw);
  const profile=profileDirectory(options.env,options.home);
  const chromium=options.chromium || await openPlaywright();
  if(task.mode==='public-check'){
    // No stored session or device profile is touched in this mode.
    const browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({acceptDownloads:false});
    try{
      const page=await context.newPage();
      await guardedNavigation(page);
      const response=await page.goto(task.target,{waitUntil:'domcontentloaded',timeout:TIMEOUT_MS});
      const actual=safeLocation(page.url());
      if(actual.origin!=='https://www.youtube.com' && actual.origin!=='https://youtube.com') throw Error('browser_public_origin_mismatch');
      return {ok:response?.status()===200,mode:task.mode,provider:task.provider,
        channelId:task.channelId,publicUrl:task.target,httpStatus:response?.status()??null,
        resolvedPath:actual.pathname,authenticated:false,streamingStatus:'unverified',
        checkedAt:new Date().toISOString()};
    }finally{await context.close();await browser.close();}
  }
  if(task.mode==='login-setup' && (!process.stdin.isTTY || process.env.CI==='true')) throw Error('browser_interactive_terminal_required');
  if(task.mode==='session-verify') await requireLocalAuthorization(profile);
  await fs.mkdir(profile,{recursive:true,mode:0o700});
  const context=await openContext(chromium,profile,task.mode==='login-setup');
  try{
    const page=context.pages()[0] || await context.newPage();
    await guardedNavigation(page);
    await page.goto(task.target,{waitUntil:'domcontentloaded',timeout:TIMEOUT_MS});
    if(task.mode==='login-setup'){
      const io=readline.createInterface({input:process.stdin,output:process.stdout});
      try{
        await io.question('본인 Google 계정으로 로그인하고 @cgma4989 채널을 선택한 뒤 Enter를 누르세요: ');
      }finally{io.close();}
      const identity=studioChannelIdentity(page.url());
      if(!identity.matched) throw Error('browser_channel_identity_unverified_select_cgma4989');
      await saveLocalAuthorization(profile);
      return {ok:true,mode:task.mode,provider:task.provider,channelId:task.channelId,
        consentStoredOnDevice:true,identityVerified:true,sessionExported:false};
    }
    const identity=studioChannelIdentity(page.url());
    const result={ok:identity.matched,mode:task.mode,provider:task.provider,
      channelId:task.channelId,identityVerified:identity.matched,
      loginRequired:identity.requiresLogin,sessionExported:false,
      location:safeLocation(page.url()),streamingStatus:'unverified',checkedAt:new Date().toISOString()};
    return result;
  }finally{await context.close();}
}
const ownFile=process.argv[1] && path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(ownFile){
  const raw={mode:process.argv[2],channel:CGMA_YOUTUBE.handle,
    interactiveConsent:process.argv.includes('--approve-interactive-setup')};
  runOwnedBrowser(raw).then(value=>{process.stdout.write(JSON.stringify(value)+'\n');if(!value.ok)process.exitCode=2;})
    .catch(error=>{process.stderr.write(JSON.stringify({ok:false,code:clean(error.message,200)})+'\n');process.exitCode=1;});
}
