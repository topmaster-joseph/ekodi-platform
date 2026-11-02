import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../worship/2026-11-08/'+p,import.meta.url),'utf8');
const html=get('index.html'),js=get('worship.js'),packet=JSON.parse(get('materials.json'));
const registry='고린도전서 7:1–9';

test('November 8 draft uses the approved EKODI common reading (1 Cor 7:1–9) and its 7-day devotion',()=>{
  assert.equal(packet.date,'2026-11-08');assert.equal(packet.scripture,registry);
  assert.equal(packet.title,'각자 받은 은사대로');assert.equal(packet.stage,'draft');assert.equal(packet.broadcastSafe,true);
  assert.equal(packet.occasion,'성령강림절 후 스물넷째 주일');
  assert.equal(packet.devotion.length,7);assert.deepEqual(packet.devotion[0],['11/08',registry]);assert.deepEqual(packet.devotion[6],['11/14','고린도전서 9:13–18']);
  assert.equal(packet.lectionary.status,'needs-verification');
  assert.match(html,/고린도전서 7:1–9/);assert.doesNotMatch(html,/고린도전서 3:1–9|자라게 하시는|학원선교|2026-11-01/);
  assert.doesNotMatch(get('prayer/index.html'),/2026-11-01/);
});

test('Thirty 16:9 text slides, score pages withheld, isolated presenter channel',()=>{
  assert.equal(packet.slides.length,30);assert.equal((js.match(/"title":/g)||[]).length,30);
  assert.ok(packet.slides.every(s=>!s.image&&s.title&&Array.isArray(s.lines)));
  assert.deepEqual(packet.slideSource.omittedPages,[6,7,8,9,10,13]);
  assert.equal(packet.slides[7].lines[0],registry);assert.equal(packet.slides[22].title,'이번 주 매일묵상 · 11/08–11/14');
  assert.match(js,/ekodi-church-worship-20261108/);assert.match(js,/ekodi:church:worship:2026-11-08:slide/);assert.doesNotMatch(js,/20261101|2026-11-01/);
  assert.equal(packet.youtube.status,'metadata-prepared-not-scheduled');assert.match(packet.youtube.title,/2026\.11\.08/);
  assert.doesNotMatch(JSON.stringify(packet),/streamKey|stream_key|rtmp|검토본|최종 확인 필요/i);
  for(const k of ['bulletin','slides','sermon'])assert.match(packet.sources[k].title,/^261108 .*\(초안\)$/,k);
  new Function(js);
});

test('Online bulletin keeps the two-sheet shape, new issue number and no private items',()=>{
  assert.equal((html.match(/class="bp-sheet"/g)||[]).length,2);
  for(const part of ['This Week’s Scripture for Meditation and Sharing · 11/08–11/14','Community Announce','Community Confession','Those who serve','[Community Sunday Worship Service]','[Worship committee]','[Sponsor or Cooperation(ABC)]','[Application question]','발행 26.11.08(45)','<th class="bp-now">11/08</th>'])assert.ok(html.includes(part),part);
  assert.doesNotMatch(html,/임진명/,'personal recovery prayer stays off the public web');
  assert.doesNotMatch(html,/핑크뮬리|국화축제/,'group photo stays off the public web');
  assert.match(html,/\/live\/church\/\?mode=studio&amp;activity=sunday&amp;date=2026-11-08/);
  for(const b of ['week','announce','photo','serve','stats','committee','sponsors','questions'])assert.match(html,new RegExp(`data-b="${b}"`),b);
  assert.match(html,/bulletin-data\.js\?v=\w+" data-date="2026-11-08"/);
  const sermon=get('sermon/index.html');
  assert.match(sermon,/<h1>261108 \| 에코디교회 주일모임 말씀나눔<\/h1>/);
  assert.match(sermon,/첫째 \| 몸과 관계도 하나님 앞에 있습니다/);assert.match(sermon,/마침기도/);
  assert.match(sermon,/확인필요/,'unverified lectionary is marked, not guessed');
  assert.doesNotMatch(sermon,/예배 전 확인|최종 확인 필요|\(초안\)/,'internal checklist is not published');
});

test('Homepage, live viewer and weekly index point to November 8 (prepared, behind the review gate)',()=>{
  const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(home,/data-weekly-bulletin href="\/ekodichurch\/worship\/2026-11-08\/"/);assert.match(home,/date=2026-11-08/);
  const live=readFileSync(new URL('../live/index.html',import.meta.url),'utf8');assert.match(live,/id="viewerBulletinLink" href="\/ekodichurch\/worship\/2026-11-08\/"/);
  const weekly=JSON.parse(readFileSync(new URL('../worship/weekly.json',import.meta.url),'utf8'));
  assert.equal(weekly.services.at(-1).date,'2026-11-08');assert.equal(weekly.services.at(-1).status,'prepared');
  assert.equal(weekly.services.filter(s=>s.status==='prepared').length,1);
  for(const [p,rel] of [['index.html','../review-gate.js'],['sermon/index.html','../../review-gate.js'],['prayer/index.html','../../review-gate.js']])
    assert.ok(get(p).includes(`<script src="${rel}" data-date="2026-11-08"></script>`),p);
});
