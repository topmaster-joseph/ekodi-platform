import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const token=process.env.E2E_ADMIN_TOKEN||'';
const tenant=process.env.TENANT_LIVE_TENANT||'ekodibiz';
const liveUrl=process.env.TENANT_LIVE_URL||'https://ekodi.kr/ekodibiz/live/';
const label=process.env.TENANT_LIVE_LABEL||'EKODI Biz';
const requireAV=process.env.TENANT_LIVE_REQUIRE_AV==='yes';
if(requireAV&&(tenant!=='ekodichurch'||liveUrl!=='https://ekodi.kr/live/church/'))throw new Error('approved_external_av_requires_canonical_church_route');
const api='https://ekodi.kr/api/realtime';
const artifactDir='artifacts/tenant-live-production-e2e';
const reportPath=`${artifactDir}/${String(tenant).replace(/[^a-z0-9._-]+/gi,'-')}.json`;
const report={passed:false,skipped:false,tenant,roomId:null,hostReady:false,hostTracks:0,viewerTracks:0,ended:false,hostStatus:null,viewerStatus:null,pageErrors:[],requestFailures:[],realtime:[]};

if(!token)throw new Error('e2e_admin_token_missing');

async function call(path,options={}){
  const headers=new Headers(options.headers||{});
  headers.set('authorization',`Bearer ${token}`);
  if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(`${api}${path}`,{...options,headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}

async function publicLive(){
  const response=await fetch(`${api}/live?tenant=${encodeURIComponent(tenant)}`,{cache:'no-store'});
  assert.equal(response.status,200);
  return response.json();
}

async function waitForPublicState(predicate,timeoutMs=30000){
  const started=Date.now();
  let last=null;
  while(Date.now()-started<timeoutMs){
    last=await publicLive();
    if(predicate(last))return last;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error(`public_state_timeout:${JSON.stringify(last)}`);
}

function observePage(page,actor){
  page.on('pageerror',error=>report.pageErrors.push({actor,message:String(error?.message||error).slice(0,500)}));
  page.on('requestfailed',request=>{
    if(!request.url().startsWith(api))return;
    report.requestFailures.push({actor,method:request.method(),path:new URL(request.url()).pathname,error:request.failure()?.errorText||'request_failed'});
  });
  page.on('response',async response=>{
    if(!response.url().startsWith(api))return;
    const entry={actor,method:response.request().method(),path:new URL(response.url()).pathname,status:response.status()};
    if(response.status()>=400){
      try{
        const data=await response.json();
        entry.error=typeof data?.error==='string'?data.error.slice(0,200):null;
        entry.code=typeof data?.code==='string'?data.code.slice(0,120):null;
      }catch{}
    }
    report.realtime.push(entry);
  });
}

async function text(page,selector){
  return page?.locator(selector).textContent().catch(()=>null);
}

await fs.mkdir(artifactDir,{recursive:true});
const initial=await publicLive();
if(initial.live){
  Object.assign(report,{passed:!requireAV,skipped:true,reason:'active_tenant_broadcast'});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(`Tenant Live production E2E skipped for ${tenant}: a real live broadcast is active.`);
  process.exit(requireAV?2:0);
}

const browser=await chromium.launch({
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']
});
let hostContext,viewerContext,host,viewer;
try{
  hostContext=await browser.newContext();
  await hostContext.grantPermissions(['camera','microphone'],{origin:'https://ekodi.kr'});
  await hostContext.addInitScript(value=>sessionStorage.setItem('ekodi-auth-token',value),token);
  host=await hostContext.newPage();
  observePage(host,'host');
  host.on('dialog',dialog=>dialog.accept().catch(()=>{}));
  await host.goto(`${liveUrl}?mode=studio&title=${encodeURIComponent(`${label} Production E2E`)}`,{waitUntil:'domcontentloaded',timeout:30000});
  try{
    await host.waitForFunction(()=>{
      const button=document.querySelector('#goLiveButton');
      const tracks=Array.from(document.querySelector('#mainVideo')?.srcObject?.getTracks?.()||[]);
      return button&&!button.disabled&&tracks.some(track=>track.readyState==='live');
    },{timeout:30000});
  }catch(error){
    report.hostStatus=await text(host,'#statusLog');
    throw new Error(`host_not_ready:${report.hostStatus||error.message}`);
  }
  report.hostTracks=await host.locator('#mainVideo').evaluate(video=>video.srcObject?.getTracks?.().filter(track=>track.readyState==='live').length||0);
  assert.ok(report.hostTracks>=1,'host_has_no_live_local_track');
  report.hostReady=true;
  report.hostStatus=await text(host,'#statusLog');

  await host.locator('#goLiveButton').click();
  try{
    await host.waitForFunction(()=>{
      const link=document.querySelector('#shareLink')?.value||'';
      return link.includes('room=');
    },{timeout:30000});
  }catch(error){
    report.hostStatus=await text(host,'#statusLog');
    throw new Error(`room_not_created_after_start:${report.hostStatus||error.message}`);
  }
  const shareLink=await host.locator('#shareLink').inputValue();
  const roomId=new URL(shareLink).searchParams.get('room');
  assert.ok(roomId,'room_id_missing');
  report.roomId=roomId;

  const live=await waitForPublicState(state=>state.live===true&&state.room?.id===roomId,30000);
  assert.equal(live.live,true);
  assert.equal(live.room?.id,roomId);

  viewerContext=await browser.newContext();
  viewer=await viewerContext.newPage();
  observePage(viewer,'viewer');
  await viewer.goto(shareLink,{waitUntil:'domcontentloaded',timeout:30000});
  try{
    await viewer.waitForFunction(()=>Array.from(document.querySelector('#viewerVideo')?.srcObject?.getTracks?.()||[]).some(track=>track.readyState==='live'),{timeout:30000});
  }catch(error){
    report.viewerStatus=await text(viewer,'#viewerStatus');
    throw new Error(`viewer_not_ready:${report.viewerStatus||error.message}`);
  }

  report.viewerStatus=await text(viewer,'#viewerStatus');
  report.viewerTracks=await viewer.locator('#viewerVideo').evaluate(video=>video.srcObject?.getTracks?.().filter(track=>track.readyState==='live').length||0);
  assert.ok(report.viewerTracks>=1,'viewer_received_no_live_track');
  if(requireAV){
    await viewer.waitForFunction(()=>{
      const v=document.querySelector('#viewerVideo');
      const tracks=v?.srcObject?.getTracks?.()||[];
      return tracks.some(t=>t.kind==='video'&&t.readyState==='live') && tracks.some(t=>t.kind==='audio'&&t.readyState==='live') &&
        v.videoWidth>0 && v.videoHeight>0 && v.currentTime>0.2;
    },null,{timeout:20000});
    const media=await viewer.locator('#viewerVideo').evaluate(v=>({
      videoTracks:v.srcObject?.getVideoTracks?.().filter(t=>t.readyState==='live').length||0,
      audioTracks:v.srcObject?.getAudioTracks?.().filter(t=>t.readyState==='live').length||0,
      videoWidth:v.videoWidth,videoHeight:v.videoHeight,playedSeconds:Number(v.currentTime.toFixed(2))
    }));
    assert.ok(media.videoTracks>=1&&media.audioTracks>=1,'external_viewer_requires_video_and_audio');
    assert.ok(media.videoWidth>0&&media.videoHeight>0&&media.playedSeconds>0.2,'external_viewer_video_must_decode_and_progress');
    report.externalReceiver={route:'/live/church/',anonymous:true,...media};
  }
  assert.equal(report.pageErrors.length,0,'browser_page_errors');

  await host.locator('#endLiveButton').click();
  const ended=await waitForPublicState(state=>state.live===false||state.room?.id!==roomId,15000);
  assert.equal(ended.live,false);
  report.ended=true;
  report.passed=true;
}catch(error){
  report.failure=String(error?.message||error).slice(0,700);
  console.error(`Tenant Live production E2E diagnostic failure for ${tenant}: ${report.failure}`);
  throw error;
}finally{
  if(host&&!report.hostStatus)report.hostStatus=await text(host,'#statusLog');
  if(viewer&&!report.viewerStatus)report.viewerStatus=await text(viewer,'#viewerStatus');
  if(report.roomId&&!report.ended){
    await call(`/rooms/${encodeURIComponent(report.roomId)}/status`,{method:'POST',body:JSON.stringify({status:'ended'})}).catch(()=>{});
  }
  await viewerContext?.close().catch(()=>{});
  await hostContext?.close().catch(()=>{});
  await browser.close().catch(()=>{});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2));
}

assert.equal(report.passed,true);
console.log(`Tenant Live production E2E passed: tenant=${tenant}, room=${report.roomId}, viewerTracks=${report.viewerTracks}`);
