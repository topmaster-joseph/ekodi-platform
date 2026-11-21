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
const mutations=[];
const report={url:'/live/church/',test:'fake-device-local-rehearsal',publicBroadcastStarted:false,serverMutations:0};
try{
  const page=await browser.newPage();
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await browser.defaultBrowserContext().overridePermissions(origin,['camera','microphone']);
  await page.setRequestInterception(true);
  page.on('request',request=>{
    // Fail closed: not even a bug may create a room, session, recording or external stream.
    if(!['GET','HEAD','OPTIONS'].includes(request.method())){
      mutations.push({method:request.method(),path:new URL(request.url()).pathname});
      void request.abort('blockedbyclient');
      return;
    }
    void request.continue();
  });
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
    return {mime:recording.type,bytes:recording.size,videoTracks:document.querySelector('#mainVideo')?.srcObject?.getVideoTracks()?.length||0,audioTracks:document.querySelector('#mainVideo')?.srcObject?.getAudioTracks()?.length||0};
  });
  assert.ok(playback.bytes>2048,'recorded local preview blob must contain actual encoded data');
  assert.ok(playback.videoTracks>=1 && playback.audioTracks>=1,'rehearsal requires video and microphone audio');
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  const mobile=await page.evaluate(()=>({
    windowWidth:window.innerWidth,
    stageWidth:document.querySelector('#programStage').getBoundingClientRect().width,
    horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+2
  }));
  assert.ok(mobile.stageWidth>240 && mobile.stageWidth<=mobile.windowWidth+2,'mobile program monitor must fit the viewport');
  assert.equal(mobile.horizontalOverflow,false,'mobile studio must not overflow horizontally');
  assert.deepEqual(mutations,[],'local rehearsal may not perform a single HTTP mutation');
  Object.assign(report,{desktopMonitorWidth:Math.round(desktop.width),mobileMonitorWidth:Math.round(mobile.stageWidth),videoTracks:playback.videoTracks,audioTracks:playback.audioTracks,recordedBytes:playback.bytes,mediaType:playback.mime,serverMutations:mutations.length,status:'pass'});
  console.log(JSON.stringify(report));
}finally{
  await mkdir('artifacts/church-live-private-rehearsal',{recursive:true});
  await writeFile('artifacts/church-live-private-rehearsal/report.json',JSON.stringify(report,null,2)+'\n');
  // Prevent leaked headless browsers or temporary camera tracks on the runner.
  await browser.close();
}
