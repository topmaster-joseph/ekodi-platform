import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  permissions: ['camera', 'microphone']
});

test('virtual broadcaster -> virtual viewer delivers synthetic camera/audio over WebRTC', async ({ page }) => {
  await page.goto('about:blank');
  const result = await page.evaluate(async () => {
    const canvas=document.createElement('canvas');
    canvas.width=360; canvas.height=640;
    const ctx=canvas.getContext('2d');
    let frame=0;
    const timer=setInterval(()=>{
      frame++;
      ctx.fillStyle='#000';ctx.fillRect(0,0,360,640);
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,28,28);ctx.fillRect(332,0,28,28);
      ctx.fillRect(0,612,28,28);ctx.fillRect(332,612,28,28);
      ctx.font='28px sans-serif';ctx.fillText(String(frame),145,330);
    },33);
    const videoStream=canvas.captureStream(30);
    const audioCtx=new AudioContext();
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    const dest=audioCtx.createMediaStreamDestination();
    gain.gain.value=.05;osc.frequency.value=440;osc.connect(gain).connect(dest);osc.start();
    const source=new MediaStream([...videoStream.getVideoTracks(),...dest.stream.getAudioTracks()]);
    const broadcaster=new RTCPeerConnection();
    const viewer=new RTCPeerConnection();
    broadcaster.onicecandidate=e=>e.candidate&&viewer.addIceCandidate(e.candidate);
    viewer.onicecandidate=e=>e.candidate&&broadcaster.addIceCandidate(e.candidate);
    const received=new MediaStream();
    viewer.ontrack=e=>received.addTrack(e.track);
    source.getTracks().forEach(track=>broadcaster.addTrack(track,source));
    await broadcaster.setLocalDescription(await broadcaster.createOffer());
    await viewer.setRemoteDescription(broadcaster.localDescription);
    await viewer.setLocalDescription(await viewer.createAnswer());
    await broadcaster.setRemoteDescription(viewer.localDescription);
    const deadline=Date.now()+5000;
    while(Date.now()<deadline && received.getTracks().length<2) await new Promise(r=>setTimeout(r,50));
    const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;video.srcObject=received;document.body.append(video);
    await video.play();
    while(Date.now()<deadline && (!video.videoWidth||video.readyState<2)) await new Promise(r=>setTimeout(r,50));
    const out={tracks:received.getTracks().map(t=>({kind:t.kind,state:t.readyState})),width:video.videoWidth,height:video.videoHeight};
    clearInterval(timer);osc.stop();source.getTracks().forEach(t=>t.stop());broadcaster.close();viewer.close();await audioCtx.close();
    return out;
  });
  expect(result.tracks.filter(t=>t.state==='live').map(t=>t.kind).sort()).toEqual(['audio','video']);
  expect(result.width).toBe(360);
  expect(result.height).toBe(640);
});

test('production live surface exposes required System Verified controls', async ({ page }) => {
  const response=await page.goto('https://ekodi.kr/ekodichurch/live/',{waitUntil:'domcontentloaded'});
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('#hostButton')).toBeAttached();
  await expect(page.locator('#presentationFileInput')).not.toHaveAttribute('accept', /.+/);
  await expect(page.locator('[data-share-mode="screen"]')).toBeAttached();
  await expect(page.locator('[data-share-mode="window"]')).toBeAttached();
  await expect(page.locator('[data-share-mode="tab"]')).toBeAttached();
  await expect(page.locator('[data-layout="pip"]')).toBeAttached();
  await expect(page.locator('[data-layout="side"]')).toBeAttached();
  await expect(page.locator('[data-layout="equal"]')).toBeAttached();
  await expect(page.locator('[data-layout="screen"]')).toBeAttached();
});
