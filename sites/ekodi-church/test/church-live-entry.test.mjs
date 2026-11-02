import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('church homepage exposes canonical broadcast and participation actions',async()=>{
  const html=await read('index.html');
  assert.match(html,/data-ekodi-church-live-entry/);
  assert.match(html,/\/live\/church\/\?mode=studio&amp;activity=sunday/);
  assert.match(html,/href="\/live\/church\/"/);
  assert.match(html,/주일예배 방송 준비/);
  assert.match(html,/EKODI Live 시청/);
});

test('church live studio keeps provider secrets server-side',async()=>{
  const [html,js]=await Promise.all([read('live/index.html'),read('live/live.js')]);
  assert.match(html,/LIVE STUDIO/);
  assert.match(html,/화면공유/);
  assert.match(html,/href="\.\/live\.css"/);
  assert.match(html,/src="\.\/live\.js"/);
  assert.match(js,/ekodi\.kr\/api\/realtime/);
  assert.match(js,/RTCPeerConnection/);
  assert.match(js,/getDisplayMedia/);
  assert.match(html,/EKODI 내부 방송 · 자동 저장/);
  assert.match(html,/외부 동시방송/);
  assert.match(js,/broadcastSelection/);
  assert.match(js,/destinationIds/);
  assert.match(js,/mode:'worship'/);
  assert.match(js,/multistream/);
  assert.doesNotMatch(js,/REALTIME_SFU_APP_SECRET|Cloudflare-Calls-Secret/);
});

test('church live host action preserves studio intent without forcing a page reload',async()=>{
  const [html,intent]=await Promise.all([read('live/index.html'),read('live/host-intent.js')]);
  assert.match(html,/src="\.\/host-intent\.js" defer/);
  assert.ok(html.indexOf('./host-intent.js')<html.indexOf('./live.js'));
  assert.match(intent,/searchParams\.set\('mode','studio'\)/);
  assert.match(intent,/history\.replaceState/);
  assert.doesNotMatch(intent,/stopImmediatePropagation/);
  assert.doesNotMatch(intent,/location\.replace\(next\.href\)/);
});

test('church header presents online as one hub while preserving EKODI Live and YouTube',async()=>{
  const [html,css]=await Promise.all([read('index.html'),read('church-live-entry.css')]);
  assert.match(html,/class="nav-online" href="#online"/);
  assert.match(html,/ONLINE · EKODI CHURCH/);
  assert.match(html,/\/live\/church\/\?mode=studio&amp;activity=sunday/);
  assert.match(html,/https:\/\/www\.youtube\.com\/@ekodichurch/);
  assert.match(html,/에코디교회 채널 ↗/);
  assert.match(css,/\.site-header \.nav-online/);
  assert.match(css,/\.church-live-youtube/);
});

test('church online hub reflects actual EKODI Live state without replacing YouTube',async()=>{
  const [html,status,css]=await Promise.all([
    read('index.html'),read('church-online-status.js'),read('church-live-entry.css')
  ]);
  assert.match(html,/src="church-online-status\.js"/);
  assert.match(status,/api\/realtime\/live\?tenant=ekodichurch/);
  assert.match(status,/setInterval\(refresh,60000\)/);
  assert.match(status,/room\?\.id/);
  assert.match(status,/\?room=\$\{encodeURIComponent\(roomId\)\}/);
  assert.match(css,/nav-online\[data-live="true"\]/);
  assert.match(css,/content:"LIVE"/);
  assert.match(html,/https:\/\/www\.youtube\.com\/@ekodichurch/);
});
