// EKODI native Google Slides audio worker (bounded to the 261011 deck).
// Requires separately consented Google login in an EKODI-owned, dedicated
// browser profile, Node 20+, and separately installed Playwright. No tokens,
// login automation, active desktop/browser profile reuse or generic browsing.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeSlidesAudioPilot, SLIDES_AUDIO_PILOT_ID,
  SLIDES_AUDIO_PRESENTATION_ID, SLIDES_AUDIO_OPERATION,
  SLIDES_AUDIO_ITEMS,
} from '../../../google-workspace-slides-audio-policy.js';

const hostBase = 'https://docs.google.com/presentation/d/';
const profile = path.resolve(process.env.EKODI_WORKSPACE_AUTOMATION_PROFILE || '');
const consentFile = process.env.EKODI_WORKSPACE_CONSENT_FILE || '';
const evidenceFile = process.env.EKODI_WORKSPACE_RESULT_FILE || '';
const canaryFile = process.env.EKODI_WORKSPACE_CANARY_FILE || '';
const outcome = (status, extra={}) => ({
  status, presentationId:SLIDES_AUDIO_PRESENTATION_ID,
  dedicatedProfileVerified:false, foregroundFocusStolen:false,
  activeUserProfileReused:false, interactiveLoginOpened:false,
  items:[], ...extra,
});
function refuse(code){ const e=new Error(code);e.code=code;throw e; }
function safeProfile(){
  if (!process.env.EKODI_WORKSPACE_AUTOMATION_PROFILE ||
      !profile.toLowerCase().includes(path.sep+'ekodi'+path.sep) ||
      /(?:^|[\\/])(default|user data|chrome|edge|opera|browser profiles)(?:[\\/]|$)/i.test(profile)) {
    refuse('DEDICATED_EKODI_PROFILE_REQUIRED');
  }
}
async function validateOperatorConsent(){
  if (!consentFile) refuse('CONSENT_RECEIPT_MISSING');
  let data;
  try { data=JSON.parse(await fs.readFile(consentFile,'utf8')); }
  catch { refuse('CONSENT_RECEIPT_UNREADABLE'); }
  const date=Date.parse(data?.expiresAt||'');
  if (data?.pilotId!==SLIDES_AUDIO_PILOT_ID ||
      data?.presentationId!==SLIDES_AUDIO_PRESENTATION_ID ||
      data?.operatorConsented!==true ||
      data?.dedicatedProfileVerified!==true ||
      !Number.isFinite(date) || date<Date.now() || date>Date.now()+7*86400000) {
    refuse('GOOGLE_OPERATOR_CONSENT_REQUIRED');
  }
}
async function consentedProfileLock(){
  const lockPath=path.join(profile,'.ekodi-slides-audio.lock');
  let handle;
  try {handle=await fs.open(lockPath,'wx',0o600);}
  catch {refuse('DEDICATED_PROFILE_IN_USE');}
  return async()=>{try{await handle.close();}finally{await fs.unlink(lockPath).catch(()=>{});}};
}
function authRequired(url){
  const host=new URL(url).hostname;
  return host==='accounts.google.com'||host==='myaccount.google.com'||host==='signin.google.com';
}
async function pickInFrames(page,fileName){
  const frames=[page,...page.frames()];
  for(const scope of frames){
    const match=scope.getByText(fileName,{exact:true});
    try {
      if (await match.first().isVisible({timeout:500})) {
        await match.first().dblclick({timeout:8000});
        return true;
      }
    } catch {}
  }
  return false;
}
async function insertOne(page,item){
  // Navigation is to a fixed presentation and slide ID, never user input.
  const url=hostBase+SLIDES_AUDIO_PRESENTATION_ID+'/edit#slide=id.'+item.slideId;
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  if(authRequired(page.url())||/\/accounts\/ServiceLogin/.test(page.url())) refuse('AUTH_REQUIRED');
  await page.waitForTimeout(1500);
  const menus=[
    page.getByRole('menuitem',{name:/^(Insert|삽입)$/i}),
    page.getByText(/^(Insert|삽입)$/i),
  ];
  let opened=false;
  for(const menu of menus){
    try {await menu.first().click({timeout:4500});opened=true;break;}catch{}
  }
  if(!opened) refuse('SLIDES_INSERT_MENU_UNAVAILABLE');
  const audioChoices=[page.getByRole('menuitem',{name:/^(Audio|오디오)$/i}),page.getByText(/^(Audio|오디오)$/i)];
  opened=false;
  for(const choice of audioChoices){
    try{await choice.first().click({timeout:4500});opened=true;break;}catch{}
  }
  if(!opened) refuse('SLIDES_AUDIO_MENU_UNAVAILABLE');
  await page.waitForTimeout(2000);
  if(authRequired(page.url())) refuse('AUTH_REQUIRED');
  const matched=await pickInFrames(page,item.name);
  if(!matched) refuse('DRIVE_AUDIO_PICKER_FILE_NOT_FOUND');
  const pickButton=page.getByRole('button',{name:/^(Insert|Select|삽입|선택)$/i});
  try {await pickButton.last().click({timeout:8000});}
  catch {
    // Some picker versions insert on a double-click; never guess by URL.
  }
  await page.waitForTimeout(1800);
  // Native audio icon must be present on the slide canvas in edit mode.
  // This is only a DOM preflight: playback confirmation is an independent
  // mandatory gate. Without it, the final result remains unverified.
  const nativeAudioControlObserved=await page.locator(
    '[aria-label*="Audio"],[aria-label*="오디오"],[data-tooltip*="audio"],[data-tooltip*="오디오"]'
  ).count() > 0;
  let playbackVerified=false;
  if(nativeAudioControlObserved){
    const control=page.getByRole('button',{name:/^(Play|재생)$/i});
    try {
      await control.first().click({timeout:3500});
      // Playback canary only passes when the actual HTMLMediaElement is
      // advancing, not merely when an audio icon or Drive URL exists.
      playbackVerified=await page.evaluate(async()=>{
        const media=[...document.querySelectorAll('audio')].find(x=>!x.paused);
        if(!media)return false;
        const position=media.currentTime;
        await new Promise(resolve=>setTimeout(resolve,1100));
        return !media.paused && media.currentTime > position;
      });
    } catch {}
  }
  return {slideId:item.slideId,fileId:item.fileId,nativeAudioControlObserved,playbackVerified,hyperlinkOnly:false};
}
export async function runGoogleWorkspaceAudioPilot({canaryOnly=false}={}){
  safeProfile();
  normalizeSlidesAudioPilot({pilotId:SLIDES_AUDIO_PILOT_ID,presentationId:SLIDES_AUDIO_PRESENTATION_ID,operation:SLIDES_AUDIO_OPERATION});
  await validateOperatorConsent();
  const stat=await fs.stat(profile).catch(()=>null);
  if(!stat?.isDirectory())refuse('DEDICATED_PROFILE_NOT_PREPARED');
  const unlock=await consentedProfileLock();
  let context;
  const report=outcome('blocked',{dedicatedProfileVerified:true});
  try{
    let playwright;
    try{playwright=await import('playwright');}catch{refuse('PLAYWRIGHT_RUNTIME_UNAVAILABLE');}
    context=await playwright.chromium.launchPersistentContext(profile,{
      headless:true,channel:'msedge',viewport:{width:1440,height:900},
      acceptDownloads:false,permissions:[],serviceWorkers:'block',
    });
    const page=context.pages()[0]||await context.newPage();
    if(canaryOnly){
      await page.goto(hostBase+SLIDES_AUDIO_PRESENTATION_ID+'/edit#slide=id.'+SLIDES_AUDIO_ITEMS[0].slideId,{
        waitUntil:'domcontentloaded',timeout:45000,
      });
      if(authRequired(page.url()) || /\/accounts\/ServiceLogin/.test(page.url())) refuse('AUTH_REQUIRED');
      const menu=page.getByRole('menuitem',{name:/^(Insert|삽입)$/i});
      if(!(await menu.first().isVisible({timeout:8000}))) refuse('SLIDES_EDITOR_AUTH_REQUIRED');
      const canary={
        verified:true,pilotId:SLIDES_AUDIO_PILOT_ID,presentationId:SLIDES_AUDIO_PRESENTATION_ID,
        agentVersion:process.env.EKODI_AGENT_VERSION||'',
        verifiedAt:new Date().toISOString(),
        dedicatedProfileVerified:true, interactiveLoginOpened:false,
      };
      if(!canaryFile || !canary.agentVersion) refuse('CANARY_OUTPUT_CONFIGURATION_REQUIRED');
      await fs.writeFile(canaryFile,JSON.stringify(canary,null,2),{mode:0o600});
      report.status='canary-ready';
      return report;
    }
    for(const item of SLIDES_AUDIO_ITEMS){
      const observation=await insertOne(page,item);
      report.items.push(observation);
      if(!observation.nativeAudioControlObserved || !observation.playbackVerified){
        refuse('NATIVE_AUDIO_CANARY_UNVERIFIED');
      }
    }
    report.status='completed';
    return report;
  } catch(e){
    report.status=e?.code==='AUTH_REQUIRED'?'auth_required':'blocked';
    report.code=e?.code||'GOOGLE_WORKSPACE_WORKER_FAILED';
    return report;
  } finally {
    if(context)await context.close().catch(()=>{});
    await unlock();
    if(evidenceFile)await fs.writeFile(evidenceFile,JSON.stringify(report,null,2),{mode:0o600}).catch(()=>{});
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const canaryOnly=process.argv.includes('--canary');
  runGoogleWorkspaceAudioPilot({canaryOnly}).then(r=>{
    process.stdout.write(JSON.stringify(r)+'\n');
    if(r.status!=='completed' && r.status!=='canary-ready')process.exitCode=2;
  }).catch(e=>{
    process.stdout.write(JSON.stringify(outcome('blocked',{code:e.code||'PREFLIGHT_FAILED'}))+'\n');
    process.exitCode=2;
  });
}
