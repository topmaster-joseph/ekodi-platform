import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('live/index.html');
const live=read('live/live.js');
const js=read('live/worship-materials.js');
const css=read('live/worship-materials.css');
const packet=JSON.parse(read('worship/2026-10-11/materials.json'));

test('public worship registry is tenant and date bound and contains approved 16-slide packet',()=>{
 assert.equal(packet.schema,'ekodi.worship.materials.v1');
 assert.equal(packet.site,'ekodichurch');
 assert.equal(packet.date,'2026-10-11');
 assert.equal(packet.slides.length,16);
 assert.match(packet.slides[0].title,/모두가 듣도록/);
 assert.match(packet.slides[15].title,/말씀대로/);
 assert.equal(packet.order.length,11);
 assert.equal(packet.devotion.length,7);
 assert.equal(packet.publicBulletin,'/ekodichurch/worship/2026-10-11/');
});

test('viewer selects only their own video slides bulletin or simultaneous composition',()=>{
 for(const mode of ['video','video-ppt','video-bulletin','all','ppt','bulletin','ppt-bulletin'])
   assert.match(html,new RegExp('data-viewer-material-mode="'+mode+'"'));
 for(const id of ['viewerVideoStage','viewerWorshipSlides','viewerWorshipBulletin','viewerMaterialStatus','viewerSlidePrev','viewerSlideNext'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/\['video','video-ppt','video-bulletin','all'\]/);
 assert.match(js,/credentials:'omit'/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/RTMP_KEY|PUBLISHABLE_KEY|privateKey|service_role/i);
 assert.match(css,/data-material-layout="all"/);
});

test('broadcaster chooses device and front or rear view before starting live',()=>{
 for(const id of ['primaryCameraSelect','cameraFacingSelect','applyPrimaryCameraButton','cameraChoiceStatus'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(live,/async function applyPrimaryCamera\(\)/);
 assert.match(live,/state\.isLive\|\|state\.hosting/);
 assert.match(live,/deviceId:\{exact:selectedCamera\}/);
 assert.match(live,/facingMode:\{ideal:facing\}/);
 assert.match(live,/getUserMedia/);
});

test('church live still uses pre-existing session-gated external channels and internal broadcast',()=>{
 assert.match(live,/destinationCatalogLoaded/);
 assert.match(live,/broadcastSelection\(\)/);
 assert.match(live,/multistream:destinationIds.length>0/);
 assert.match(html,/EKODI 내부 방송 · 자동 저장/);
 assert.match(html,/src="\.\/worship-materials\.js" defer/);
 assert.match(html,/href="\.\/worship-materials\.css"/);
 new Function(js);
});

test('broadcast live defaults to the verified latest Sunday while keeping dated archives',()=>{
 assert.match(js,/fetch\('\/ekodichurch\/worship\/weekly\.json'/);
 assert.match(js,/timeZone:'Asia\/Seoul'/);
 assert.match(js,/requestedDate!==null/);
 assert.match(js,/return dates\.find\(day=>day>=kstDate\(\)\)\|\|dates\[dates\.length-1\]/);
 assert.match(js,/result\.date!==date/);
 assert.doesNotMatch(js,/const requestedDate=query\.get\('date'\)\|\|'2026-10-11'/);
 assert.match(html,/id="viewerBulletinLink" href="\/ekodichurch\/worship\/2026-11-08\//);
 const weekly=JSON.parse(read('worship/weekly.json'));
 assert.deepEqual(weekly.services.map(item=>item.date),['2026-10-11','2026-10-18','2026-10-25','2026-11-01','2026-11-08']);
 const next=JSON.parse(read('worship/2026-11-08/materials.json'));
 assert.equal(next.date,'2026-11-08');
 assert.equal(next.scripture,'고린도전서 7:1–9');
 assert.equal(next.slides.length,30);
 const bulletin=read('worship/2026-11-08/index.html');
 assert.match(bulletin,/This Week’s Scripture for Meditation and Sharing · 11\/08–11\/14/);
 assert.doesNotMatch(bulletin,/11\/01–11\/07/);
 new Function(js);
});
