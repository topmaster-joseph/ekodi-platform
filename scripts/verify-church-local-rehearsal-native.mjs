// Read-only native Church studio rehearsal. It NEVER clicks the actual broadcast controls.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const origin='https://ekodi.kr';
const url=origin+'/live/church/?mode=studio&activity=event';
const executablePath=process.env.CHROME_BIN;
assert.ok(executablePath,'CHROME_BIN must refer to a first-party runner Chromium binary');
const browser=await puppeteer.launch({
  executablePath,headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']
});
const forbiddenMutations=[],blockedBackgroundRequests=[];
const report={url:'/live/church/',test:'fake-device-local-rehearsal',publicBroadcastStarted:false,serverMutations:0};
// A single fail-closed network gate applies to the host and the independent guest viewer.
function readOnlyRequest(request){
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){
    // Always abort writes. Exempt known analytics from *violation counting*, never from blocking.
    const path=new URL(request.url()).pathname;
    if(path.startsWith('/cdn-cgi/challenge-platform/')||path==='/cdn-cgi/rum'||path==='/api/telemetry/visit'){
      blockedBackgroundRequests.push(path.startsWith('/cdn-cgi/')?'cloudflare-background':'visit-metrics');
    }else{
      forbiddenMutations.push({method:request.method(),category:path.startsWith('/api/realtime')?'realtime-broadcast':path.startsWith('/api/')?'unexpected-api-write':'unexpected-external-write'});
    }
    void request.abort('blockedbyclient');
    return;
  }
  void request.continue();
}
try{
  const page=await browser.newPage();
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await browser.defaultBrowserContext().overridePermissions(origin,['camera','microphone']);
  await page.setRequestInterception(true);
  page.on('request',readOnlyRequest);
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#localRehearsalStart',{visible:true,timeout:25000});
  await page.waitForFunction(()=>{
    const stream=document.querySelector('#mainVideo')?.srcObject;
    return !!stream && stream.getVideoTracks().some(track=>track.readyState==='live') &&
      stream.getAudioTracks().some(track=>track.readyState==='live'&&track.enabled);
  },{timeout:30000});
  const desktop=await page.evaluate(()=>{
    const stage=document.querySelector('#programStage');
    const canvas=document.querySelector('#mainVideo')?.srcObject?.getVideoTracks()?.[0];
    return {width:stage.getBoundingClientRect().width,streamLabel:canvas?.kind||'none'};
  });
  assert.ok(desktop.width<=480 && desktop.width>=300,'desktop Church program monitor must be approx half width: '+desktop.width);
  await page.click('#localRehearsalStart');
  await page.waitForFunction(()=>document.querySelector('#localRehearsalStop')?.disabled===false,{timeout:20000});
  await new Promise(resolve=>setTimeout(resolve,2800));
  await page.click('#localRehearsalStop');
  await page.waitForFunction(()=>{
    const v=document.querySelector('#localRehearsalPlayback');
    return !!v?.src && v.src.startsWith('blob:') && !v.classList.contains('hidden');
  },{timeout:20000});
  const playback=await page.evaluate(async()=>{
    const v=document.querySelector('#localRehearsalPlayback');
    const recording=await (await fetch(v.src)).blob();
    // A nonzero blob is not a valid rehearsal unless Chromium can actually decode and play it.
    v.muted=true;
    await v.play();
    await new Promise(resolve=>setTimeout(resolve,850));
    return {
      mime:recording.type,bytes:recording.size,
      decodedWidth:v.videoWidth,decodedHeight:v.videoHeight,playedSeconds:v.currentTime,
      videoTracks:document.querySelector('#mainVideo')?.srcObject?.getVideoTracks()?.length||0,
      audioTracks:document.querySelector('#mainVideo')?.srcObject?.getAudioTracks()?.length||0
    };
  });
  assert.ok(playback.bytes>2048,'recorded local preview blob must contain actual encoded data');
  assert.ok(playback.decodedWidth>0 && playback.decodedHeight>0 && playback.playedSeconds>0.1,'local recording must decode and advance in the browser player');
  assert.ok(playback.videoTracks>=1 && playback.audioTracks>=1,'rehearsal requires video and microphone audio');
  // External reachability is verified from the GitHub-hosted runner, not the user's LAN.
  // No room is created: anonymous access checks are strictly GET-only.
  const viewerResponse=await fetch(origin+'/live/church/?mode=viewer',{redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert.equal(viewerResponse.status,200,'public guest viewer route must return HTTP 200, without redirect');
  const viewerHtml=await viewerResponse.text();
  assert.match(viewerHtml,/id="viewerVideo"/,'guest viewer HTML must provide a media element');
  assert.match(viewerHtml,/data-tenant="ekodichurch"/,'guest viewer must be scoped to Church tenant');
  const liveResponse=await fetch(origin+'/api/realtime/live?tenant=ekodichurch',{
    redirect:'manual',headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)
  });
  assert.equal(liveResponse.status,200,'anonymous live-state API must return HTTP 200');
  const externalLive=await liveResponse.json();
  assert.equal(typeof externalLive.live,'boolean','public live-state API must return a boolean status');
  const external={viewerPageHttp:viewerResponse.status,liveApiHttp:liveResponse.status,anonymous:true,
    liveNow:externalLive.live,guestBrowser:'skipped_live_in_progress'};
  // Do not attach to (or change) someone else's real broadcast during a safety canary.
  if(!externalLive.live){
    const guestContext=await browser.createBrowserContext();
    try{
      const guest=await guestContext.newPage();
      await guest.setRequestInterception(true);
      guest.on('request',readOnlyRequest);
      const navigation=await guest.goto(origin+'/live/church/?mode=viewer',{waitUntil:'domcontentloaded',timeout:30000});
      assert.equal(navigation?.status(),200,'anonymous external guest browser must load the live route');
      await guest.waitForFunction(()=>document.querySelector('#viewerStatus')?.textContent?.trim()==='현재 방송 없음',
        {timeout:20000});
      const state=await guest.evaluate(()=>({
        viewerVisible:!document.querySelector('#viewerView')?.classList.contains('hidden'),
        status:document.querySelector('#viewerStatus')?.textContent?.trim()||'',
        hasAccessToken:Boolean(sessionStorage.getItem('ekodi-auth-token'))
      }));
      assert.equal(state.viewerVisible,true,'guest viewer must enter the viewer surface without login');
      assert.equal(state.hasAccessToken,false,'guest must remain anonymous');
      assert.equal(state.status,'현재 방송 없음','idle broadcast must be communicated clearly');
      external.guestBrowser='pass_idle_viewer';
    }finally{
      await guestContext.close();
    }
  }
  report.externalViewer=external;
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  const mobile=await page.evaluate(()=>({
    windowWidth:window.innerWidth,
    stageWidth:document.querySelector('#programStage').getBoundingClientRect().width,
    horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+2
  }));
  assert.ok(mobile.stageWidth>240 && mobile.stageWidth<=mobile.windowWidth+2,'mobile program monitor must fit the viewport');
  assert.equal(mobile.horizontalOverflow,false,'mobile studio must not overflow horizontally');
  assert.deepEqual(forbiddenMutations,[],'local rehearsal may not attempt any broadcast or unexpected API mutation');
  Object.assign(report,{desktopMonitorWidth:Math.round(desktop.width),mobileMonitorWidth:Math.round(mobile.stageWidth),videoTracks:playback.videoTracks,audioTracks:playback.audioTracks,recordedBytes:playback.bytes,decodedWidth:playback.decodedWidth,decodedHeight:playback.decodedHeight,playedSeconds:Number(playback.playedSeconds.toFixed(2)),mediaType:playback.mime,serverMutations:forbiddenMutations.length,blockedBackgroundRequests:blockedBackgroundRequests.length,status:'pass'});
  console.log(JSON.stringify(report));
}finally{
  await mkdir('artifacts/church-live-private-rehearsal',{recursive:true});
  await writeFile('artifacts/church-live-private-rehearsal/report.json',JSON.stringify(report,null,2)+'\n');
  // Prevent leaked headless browsers or temporary camera tracks on the runner.
  await browser.close();
}
