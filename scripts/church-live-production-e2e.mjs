import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

// Verification marker: church-live-explicit-start-auth-20260916
const token=process.env.E2E_ADMIN_TOKEN||'';
const liveUrl=process.env.CHURCH_LIVE_URL||'https://ekodi.kr/ekodichurch/live/';
const api='https://ekodi.kr/api/realtime';
const artifactDir='artifacts/church-live-production-e2e';
const report={
  passed:false,skipped:false,roomId:null,hostReady:false,viewerTracks:0,ended:false,
  hostStatus:null,hostUrl:null,viewerStatus:null,pageErrors:[],requestFailures:[],realtime:[],
  nativeBrowser:'EKODI-owned isolated Chromium',camera:{qrIssued:false,unauthorizedRejected:false,hostApproved:false,syntheticDevicePublished:false,hostVideoReceived:false,videoResized:false,chatResized:false,viewerTrackMaintained:false,revoked:false}

};
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
  const response=await fetch(`${api}/live?tenant=ekodichurch`,{cache:'no-store'});
  assert.equal(response.status,200);
  return response.json();
}

function safeRealtimePath(url){
  const pathname=new URL(url).pathname;
  return pathname.replace(/(\/api\/realtime\/management-cameras\/)[^/]+/,'$1[redacted]');
}
function observePage(page,actor){
  page.on('pageerror',error=>report.pageErrors.push({actor,message:String(error?.message||error).slice(0,500)}));
  page.on('requestfailed',request=>{
    if(!request.url().startsWith(api))return;
    report.requestFailures.push({actor,method:request.method(),path:safeRealtimePath(request.url()),error:request.failure()?.errorText||'request_failed'});
  });
  page.on('response',async response=>{
    if(!response.url().startsWith(api))return;
    const entry={actor,method:response.request().method(),path:safeRealtimePath(response.url()),status:response.status()};
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
  Object.assign(report,{passed:true,skipped:true,reason:'active_church_broadcast'});
  await fs.writeFile(`${artifactDir}/report.json`,JSON.stringify(report,null,2));
  console.log('Church Live production E2E skipped: a real live broadcast is active.');
  process.exit(0);
}

const browser=await chromium.launch({
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']
});
let hostContext,viewerContext,cameraContext,host,viewer,cameraPage,cameraPairId;
try{
  hostContext=await browser.newContext();
  await hostContext.grantPermissions(['camera','microphone'],{origin:'https://ekodi.kr'});
  await hostContext.addInitScript(value=>sessionStorage.setItem('ekodi-auth-token',value),token);
  host=await hostContext.newPage();
  observePage(host,'host');
  await host.goto(`${liveUrl}?mode=studio&title=${encodeURIComponent('EKODI Church Production E2E')}`,{waitUntil:'domcontentloaded',timeout:30000});
  try{
    await host.waitForFunction(()=>{
      const button=document.querySelector('#goLiveButton');
      const phase=document.querySelector('#programBadge')?.dataset?.phase;
      return button&&!button.disabled&&(phase==='ready'||phase==='idle');
    },{timeout:30000});
  }catch(error){
    report.hostStatus=await text(host,'#statusLog');
    report.hostUrl=host.url();
    throw new Error(`host_not_ready:${report.hostStatus||error.message}`);
  }
  report.hostReady=true;
  report.hostStatus=await text(host,'#statusLog');
  report.hostUrl=host.url();
  await host.locator('#goLiveButton').click();
  await host.waitForFunction(()=>document.querySelector('#programBadge')?.dataset?.phase==='live',{timeout:30000});
  const shareLink=await host.locator('#shareLink').inputValue();
  const roomId=new URL(shareLink).searchParams.get('room');
  assert.ok(roomId,'room_id_missing');
  report.roomId=roomId;
  const live=await publicLive();
  assert.equal(live.live,true);
  assert.equal(live.room?.id,roomId);

  viewerContext=await browser.newContext();
  viewer=await viewerContext.newPage();
  observePage(viewer,'viewer');
  await viewer.goto(`${liveUrl}?room=${encodeURIComponent(roomId)}`,{waitUntil:'domcontentloaded',timeout:30000});
  try{
    await viewer.waitForFunction(()=>Array.from(document.querySelector('#viewerVideo')?.srcObject?.getTracks?.()||[]).some(track=>track.readyState==='live'),{timeout:30000});
  }catch(error){
    report.viewerStatus=await text(viewer,'#viewerStatus');
    throw new Error(`viewer_not_ready:${report.viewerStatus||error.message}`);
  }
  report.viewerStatus=await text(viewer,'#viewerStatus');
  report.viewerTracks=await viewer.locator('#viewerVideo').evaluate(video=>video.srcObject?.getTracks?.().filter(track=>track.readyState==='live').length||0);
  assert.ok(report.viewerTracks>=1,'viewer_received_no_live_track');
  assert.equal(report.pageErrors.length,0,'browser_page_errors');

  // First-party EKODI Chromium, using a separate simulated handset with fake video.
  // It does not reuse the user's desktop browser, Google account or mobile device.
  const viewerVideoTrack=await viewer.locator('#viewerVideo').evaluate(v=>v.srcObject?.getVideoTracks?.()[0]?.id||'');
  assert.ok(viewerVideoTrack,'program_video_track_missing');
  await host.locator('#openManagementCameraButton').click();
  await host.locator('#managementCameraDialog').waitFor({state:'visible',timeout:15000});
  const cameraUrl=await host.locator('#managementCameraUrl').inputValue();
  const url=new URL(cameraUrl);
  assert.equal(url.origin,'https://ekodi.kr');
  assert.match(url.pathname,/^\/live\/c\/[A-Za-z0-9_-]{8,80}$/);
  const pairCode=url.pathname.split('/').at(-1);
  const pairList=await call(`/rooms/${encodeURIComponent(roomId)}/management-cameras`);
  const issued=(pairList.pairs||[]).find(p=>p.status==='issued');
  assert.ok(issued?.id,'management_pair_missing');
  cameraPairId=issued.id;
  report.camera.qrIssued=true;

  // Pair code alone never grants camera control. The device key and host approval are mandatory.
  const noDevice=await fetch(`${api}/management-cameras/${encodeURIComponent(pairCode)}/status`,{cache:'no-store'});
  assert.equal(noDevice.status,403,'camera_without_device_key_allowed');
  report.camera.unauthorizedRejected=true;

  cameraContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await cameraContext.grantPermissions(['camera'],{origin:'https://ekodi.kr'});
  cameraPage=await cameraContext.newPage();
  observePage(cameraPage,'synthetic-mobile-camera');
  await cameraPage.goto(cameraUrl,{waitUntil:'domcontentloaded',timeout:30000});
  await cameraPage.locator('#managementCameraConnect').click();
  await cameraPage.waitForFunction(()=>document.querySelector('#managementCameraDeviceStatus')?.textContent?.includes('승인 대기'),null,{timeout:18000});
  const beforeApproval=await call(`/rooms/${encodeURIComponent(roomId)}/management-cameras`);
  assert.equal(beforeApproval.pairs?.find(p=>p.id===cameraPairId)?.status,'pending');
  await host.locator('#managementCameraPairs button').filter({hasText:'연결 승인'}).first().waitFor({timeout:14000});
  await host.locator('#managementCameraPairs button').filter({hasText:'연결 승인'}).first().click();
  await cameraPage.waitForFunction(()=>document.querySelector('#managementCameraDeviceStatus')?.textContent?.includes('연결됨'),null,{timeout:45000});
  report.camera.hostApproved=true;
  report.camera.syntheticDevicePublished=true;

  const managementCard=host.locator('#managementCameraSources .source-card-row').first();
  await managementCard.waitFor({state:'visible',timeout:45000});
  await host.waitForFunction(()=>{
    const videos=[...document.querySelectorAll('#programScreen video[id^="overlayVideo-"]')];
    return videos.some(v=>v.videoWidth>0&&v.srcObject?.getVideoTracks?.().some(track=>track.readyState==='live'));
  },{timeout:30000});
  report.camera.hostVideoReceived=true;
  await managementCard.getByRole('button',{name:'방송화면에 추가'}).click();
  const overlay=host.locator('#programOverlayLayer .program-drag-handle[data-program-overlay^="management_camera:"]').first();
  await overlay.waitFor({state:'visible',timeout:10000});
  const beforeVideo=await overlay.boundingBox();
  assert.ok(beforeVideo?.width>20,'management_video_overlay_missing');
  const videoGrip=overlay.locator('.overlay-resize-grip');
  const videoGripBox=await videoGrip.boundingBox();
  await host.mouse.move(videoGripBox.x+videoGripBox.width/2,videoGripBox.y+videoGripBox.height/2);
  await host.mouse.down();
  await host.mouse.move(videoGripBox.x+videoGripBox.width/2+24,videoGripBox.y+videoGripBox.height/2+16,{steps:5});
  await host.mouse.up();
  const afterVideo=await overlay.boundingBox();
  assert.ok(afterVideo.width>beforeVideo.width+8,'director_video_resize_not_applied');
  report.camera.videoResized=true;

  await host.locator('#chatOverlaySource').click();
  const chatOverlay=host.locator('[data-program-overlay="chat"]');
  await chatOverlay.waitFor({state:'visible',timeout:10000});
  const beforeChat=await chatOverlay.boundingBox();
  const grip=chatOverlay.locator('.overlay-resize-grip');
  const gripBox=await grip.boundingBox();
  await host.mouse.move(gripBox.x+gripBox.width/2,gripBox.y+gripBox.height/2);
  await host.mouse.down();
  await host.mouse.move(gripBox.x+gripBox.width/2+24,gripBox.y+gripBox.height/2+15,{steps:5});
  await host.mouse.up();
  const afterChat=await chatOverlay.boundingBox();
  assert.ok(afterChat.width>beforeChat.width+8,'director_chat_resize_not_applied');
  report.camera.chatResized=true;

  const afterViewerTrack=await viewer.locator('#viewerVideo').evaluate(v=>v.srcObject?.getVideoTracks?.()[0]?.id||'');
  assert.equal(afterViewerTrack,viewerVideoTrack,'viewer_track_replaced_on_resize');
  report.camera.viewerTrackMaintained=true;
  assert.equal(report.pageErrors.length,0,'native_camera_browser_page_errors');

  await call(`/rooms/${encodeURIComponent(roomId)}/management-cameras/${encodeURIComponent(cameraPairId)}`,{
    method:'PATCH',body:JSON.stringify({status:'revoked'})
  });
  const revoked=await call(`/rooms/${encodeURIComponent(roomId)}/management-cameras`);
  assert.equal(revoked.pairs?.find(p=>p.id===cameraPairId)?.status,'revoked');
  report.camera.revoked=true;
  await cameraContext.close();cameraContext=null;

  await host.locator('#endLiveButton').click();
  await host.waitForFunction(()=>document.querySelector('#programBadge')?.dataset?.phase==='ended',{timeout:15000});
  const ended=await publicLive();
  assert.equal(ended.live,false);
  report.ended=true;
  report.passed=true;
}catch(error){
  report.failure=String(error?.message||error).slice(0,700);
  console.error(`Church Live production E2E diagnostic failure: ${report.failure}`);
  throw error;
}finally{
  if(host&&!report.hostStatus)report.hostStatus=await text(host,'#statusLog');
  if(host&&!report.hostUrl)report.hostUrl=host.url();
  if(viewer&&!report.viewerStatus)report.viewerStatus=await text(viewer,'#viewerStatus');
  if(report.roomId&&cameraPairId&&!report.camera.revoked){
    await call(`/rooms/${encodeURIComponent(report.roomId)}/management-cameras/${encodeURIComponent(cameraPairId)}`,{method:'PATCH',body:JSON.stringify({status:'revoked'})}).catch(()=>{});
  }
  if(report.roomId&&!report.ended){
    await call(`/rooms/${encodeURIComponent(report.roomId)}/status`,{method:'POST',body:JSON.stringify({status:'ended'})}).catch(()=>{});
  }
  await cameraContext?.close().catch(()=>{});
  await viewerContext?.close().catch(()=>{});
  await hostContext?.close().catch(()=>{});
  await browser.close().catch(()=>{});
  await fs.writeFile(`${artifactDir}/report.json`,JSON.stringify(report,null,2));
}

assert.equal(report.passed,true);
console.log(`Church Live production E2E passed: room=${report.roomId}, viewerTracks=${report.viewerTracks}`);
