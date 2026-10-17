import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

// Public, zero-credential EKODI-owned Chromium verification.
// This does NOT assert actual Google login, QR pairing, or real device WebRTC.
const url='https://ekodi.kr/ekodichurch/live/?mode=studio';
const artifactDir='artifacts/church-director-native-browser';
const report={mode:'ekodi-owned-isolated-headless-chromium',origin:'https://ekodi.kr',publicOnly:true,
  authenticated:false,realDevice:false,actualRemoteMedia:false,passed:false,checks:[],pageErrors:[]};
await fs.mkdir(artifactDir,{recursive:true});
const browser=await chromium.launch({headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
async function inspect(width,height,name){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<640,hasTouch:width<640});
  const page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push({view:name,error:String(error.message||error).slice(0,250)}));
  try{
    await context.grantPermissions(['camera','microphone'],{origin:'https://ekodi.kr'});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
    await page.locator('#openManagementCameraButton').waitFor({state:'visible',timeout:25000});
    assert.equal(await page.locator('#managementCameraDialog').isVisible(),false,'QR dialog opened without operator action');
    assert.equal(await page.locator('#managementCameraSources').count(),1);
    assert.equal(await page.locator('#managementCameraPairs').count(),1);
    assert.equal(await page.locator('#presenterResizeGrip').count(),1);
    const qr=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');
      window.EKODIManagementCameraQr.draw(canvas,'https://ekodi.kr/live/c/synthetic-preview-no-real-pair');
      return {width:canvas.width,height:canvas.height};
    });
    assert.ok(qr.width>=200&&qr.height>=200,'first party QR renderer not working');
    await page.locator('#chatOverlaySource').click();
    const overlay=page.locator('[data-program-overlay="chat"]');
    await overlay.waitFor({state:'visible',timeout:12000});
    await page.locator('#programScreen').scrollIntoViewIfNeeded();
    const before=await overlay.boundingBox();
    const grip=overlay.locator('.overlay-resize-grip');
    const rect=await grip.boundingBox();
    assert.ok(rect?.width>10,'chat resize grip missing');
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
    await page.mouse.down();
    await page.mouse.move(rect.x+rect.width/2+27,rect.y+rect.height/2+17,{steps:8});
    await page.mouse.up();
    const after=await overlay.boundingBox();
    assert.ok(after.width>before.width+8,'chat resize does not update actual stage');
    report.checks.push({device:name,qrRenderer:true,operatorQrUi:true,chatResizeOnLiveStage:true,remoteMediaNotClaimed:true});
    await page.screenshot({path:`${artifactDir}/${name}.png`,fullPage:true});
  }finally{
    await context.close();
  }
}
try{
  await inspect(1366,900,'pc');
  await inspect(390,844,'mobile');
  assert.deepEqual(report.pageErrors,[],'public Chrome page errors');
  report.passed=true;
}finally{
  await browser.close();
  await fs.writeFile(`${artifactDir}/report.json`,JSON.stringify(report,null,2));
}
assert.equal(report.passed,true);
console.log('EKODI first-party Chromium public director QR and chat resize: PC+mobile passed');
