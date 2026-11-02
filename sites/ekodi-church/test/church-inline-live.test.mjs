import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('Church Online right card contains accessible inline viewer, fullscreen and renamed studio action',async()=>{
  const [html,css,script]=await Promise.all([
    read('index.html'),read('church-inline-live.css'),read('church-inline-live.js')
  ]);
  const online=html.slice(html.indexOf('<section class="online section"'),html.indexOf('<section class="community-visit"'));
  assert.match(online,/id="churchInlineLiveStage"/);
  assert.match(online,/id="churchInlineLiveFrame"[^>]*allowfullscreen/);
  assert.match(online,/id="churchWatchLive"[^>]*aria-controls="churchInlineLiveFrame"/);
  assert.match(online,/id="churchWatchFullscreen"[^>]*disabled/);
  assert.match(online,/실시간 방송 준비/);
  assert.doesNotMatch(online,/활동 방송 준비/);
  assert.match(online,/href="\/live\/church\/\?mode=studio&amp;activity=event"/);
  assert.match(html,/src="church-inline-live.js" defer/);
  assert.match(css,/\.church-inline-live-stage:fullscreen/);
  assert.match(script,/frame\.removeAttribute\('src'\)/);
  assert.doesNotMatch(script,/localStorage|sessionStorage|createRoom|startBroadcast/);
  new Function(script);
});

test('click mounts the same-origin public viewer, toggles fullscreen, and closes playback',async()=>{
  const script=await read('church-inline-live.js');
  const makeElement=()=>({
    hidden:false,disabled:false,textContent:'',dataset:{},attrs:{},events:{},
    addEventListener(name,callback){this.events[name]=callback},
    setAttribute(name,value){this.attrs[name]=value},
    removeAttribute(name){delete this[name]}
  });
  const ids=['churchInlineLive','churchInlineLiveStage','churchInlineLivePlaceholder',
    'churchInlineLiveFrame','churchWatchLive','churchWatchFullscreen','churchInlineLiveStatus'];
  const elements=Object.fromEntries(ids.map(id=>[id,makeElement()]));
  const document={
    fullscreenElement:null, events:{},
    getElementById:id=>elements[id],addEventListener(name,cb){this.events[name]=cb},
    async exitFullscreen(){this.fullscreenElement=null;this.events.fullscreenchange()}
  };
  // Match the actual HTML disabled attribute before the runtime boots.
  elements.churchWatchFullscreen.disabled=true;
  elements.churchInlineLiveStage.requestFullscreen=async()=>{
    document.fullscreenElement=elements.churchInlineLiveStage;
    document.events.fullscreenchange();
  };
  const window={addEventListener(){}};
  vm.runInNewContext(script,{document,window,location:{origin:'https://ekodi.kr'},URL});
  const player=elements.churchInlineLiveFrame,watch=elements.churchWatchLive,fullscreen=elements.churchWatchFullscreen;
  assert.equal(player.src,undefined,'must not connect to a room before explicit click');
  assert.equal(fullscreen.disabled,true);
  watch.events.click();
  assert.equal(player.src,'/live/church/?mode=viewer&embed=church-online');
  assert.equal(player.hidden,false);
  assert.equal(watch.attrs['aria-expanded'],'true');
  assert.equal(fullscreen.disabled,false);
  await fullscreen.events.click();
  assert.equal(document.fullscreenElement,elements.churchInlineLiveStage);
  assert.equal(fullscreen.textContent,'전체화면 종료');
  watch.events.click();
  assert.equal(player.src,undefined);
  assert.equal(player.hidden,true);
  assert.equal(watch.textContent,'실시간 방송 시청');
});

test('Church CSP allows only first-party iframe sources, without weakening frame-ancestors',async()=>{
  const headers=await read('_headers');
  assert.match(headers,/frame-src 'self' https:\/\/www\.youtube-nocookie\.com/);
  assert.match(headers,/frame-ancestors 'none'/);
});

test('Church homepage points to the single canonical EKODI Live system',async()=>{
  const html=await read('index.html');
  const js=await read('church-inline-live.js');
  assert.match(js,/new URL\('\/live\/church\/', location.origin\)/);
  assert.match(html,/href="\/live\/church\/\?mode=studio&amp;activity=event"/);
  assert.match(html,/src="church-daily-verse.js"/);
  assert.doesNotMatch(html,/href="\/ekodichurch\/live\/\?mode=studio/);
  new Function(js);
});
