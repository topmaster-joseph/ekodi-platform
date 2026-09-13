import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const token=process.env.E2E_ADMIN_TOKEN||'';
const liveUrl=process.env.CHURCH_LIVE_URL||'https://ekodi.kr/ekodichurch/live/';
const api='https://ekodi.kr/api/realtime';
const artifactDir='artifacts/church-live-production-e2e';
const report={passed:false,skipped:false,roomId:null,hostReady:false,hostStatus:'',hostErrors:[],failedRequests:[],viewerTracks:0,ended:false};
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
  args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']
});
let hostContext,viewerContext,host,viewer;
try{
  hostContext=await browser.newContext();
  await hostContext.grantPermissions(['camera','microphone'],{origin:'https://ekodi.kr'});
  await hostContext.addInitScript(value=>sessionStorage.setItem('ekodi-auth-token',value),token);
  host=await hostContext.newPage();
  const hostErrors=[];
  host.on('pageerror',error=>hostErrors.push(error.message));
  host.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText||'request_failed'}));
  await host.goto(`${liveUrl}?mode=studio&title=${encodeURIComponent('EKODI Church Production E2E')}`,{waitUntil:'domcontentloaded',timeout:30000});
  await host.waitForFunction(()=>{const text=document.querySelector('#statusLog')?.textContent||'';return text.includes('미디어 연결이 완료되었습니다')||text.startsWith('방송 준비 실패:')},{timeout:30000});
  report.hostStatus=await host.locator('#statusLog').textContent()||'';
  report.hostErrors=[...hostErrors];
  if(!report.hostStatus.includes('미디어 연결이 완료되었습니다'))throw new Error(`host_setup_failed:${report.hostStatus}`);
  report.hostReady=true;
  const shareLink=await host.locator('#shareLink').inputValue();
  const roomId=new URL(shareLink).searchParams.get('room');
  assert.ok(roomId,'room_id_missing');
  report.roomId=roomId;
  await host.locator('#goLiveButton').click();
  await host.waitForFunction(()=>document.querySelector('#liveState')?.textContent==='방송 중',{timeout:15000});
  const live=await publicLive();
  assert.equal(live.live,true);
  assert.equal(live.room?.id,roomId);

  viewerContext=await browser.newContext();
  viewer=await viewerContext.newPage();
  const viewerErrors=[];
  viewer.on('pageerror',error=>viewerErrors.push(error.message));
  await viewer.goto(`${liveUrl}?room=${encodeURIComponent(roomId)}`,{waitUntil:'domcontentloaded',timeout:30000});
  await viewer.waitForFunction(()=>document.querySelector('#viewerStatus')?.textContent?.includes('실시간 방송에 연결되었습니다'),{timeout:30000});
  report.viewerTracks=await viewer.locator('#viewerVideo').evaluate(video=>video.srcObject?.getTracks?.().filter(track=>track.readyState==='live').length||0);
  assert.ok(report.viewerTracks>=1,'viewer_received_no_live_track');
  assert.deepEqual(hostErrors,[],'host_page_errors');
  assert.deepEqual(viewerErrors,[],'viewer_page_errors');

  await host.locator('#endLiveButton').click();
  await host.waitForFunction(()=>document.querySelector('#programBadge')?.textContent==='종료',{timeout:15000});
  const ended=await publicLive();
  assert.equal(ended.live,false);
  report.ended=true;
  report.passed=true;
}finally{
  if(report.roomId&&!report.ended){
    await call(`/rooms/${encodeURIComponent(report.roomId)}/status`,{method:'POST',body:JSON.stringify({status:'ended'})}).catch(()=>{});
  }
  await viewerContext?.close().catch(()=>{});
  await hostContext?.close().catch(()=>{});
  await browser.close().catch(()=>{});
  await fs.writeFile(`${artifactDir}/report.json`,JSON.stringify(report,null,2));
}

assert.equal(report.passed,true);
console.log(`Church Live production E2E passed: room=${report.roomId}, viewerTracks=${report.viewerTracks}`);
