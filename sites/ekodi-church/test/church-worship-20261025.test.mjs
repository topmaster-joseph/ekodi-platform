import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../worship/2026-10-25/'+p,import.meta.url),'utf8');
const html=get('index.html'),js=get('worship.js'),packet=JSON.parse(get('materials.json'));
test('October 25 Sunday uses the EKODI common reading and is independent of earlier weeks',()=>{
  assert.equal(packet.date,'2026-10-25');assert.equal(packet.scripture,'오바댜 1:10–16');assert.equal(packet.title,'깨어진 형제애, 다시 세울 공동체');assert.equal(packet.occasion,'종교개혁주일');
  assert.equal(packet.devotion.length,7);assert.deepEqual(packet.devotion[0],['10/25','오바댜 1:10–16']);assert.deepEqual(packet.devotion[6],['10/31','고린도전서 2:6–16']);
  assert.match(html,/오바댜 1:10–16/);assert.doesNotMatch(html,/2026-10-18|신명기/);
  assert.doesNotMatch(get('prayer/index.html'),/2026-10-18/);
});
test('Sixteen slides, isolated presenter channel, YouTube metadata not claimed as scheduled',()=>{
  assert.equal(packet.slides.length,28);assert.equal((js.match(/"title":/g)||[]).length,28);assert.ok(packet.slides.every((s,i)=>s.image===`./slides/${String(i+1).padStart(2,'0')}.webp`));assert.deepEqual(packet.slideSource.omittedPages,[6,7,8,9,10,13,33]);
  assert.match(js,/ekodi-church-worship-20261025/);assert.match(js,/ekodi:church:worship:2026-10-25:slide/);assert.doesNotMatch(js,/20261018|2026-10-18/);
  assert.equal(packet.youtube.status,'metadata-prepared-not-scheduled');assert.match(packet.youtube.title,/2026\.10\.25/);
  assert.doesNotMatch(JSON.stringify(packet),/streamKey|stream_key|rtmp/i);
});
test('Operator view carries the multilingual caption run-sheet and links to EKODI Live',()=>{
  assert.equal(packet.interpretation.captions,true);assert.deepEqual(packet.interpretation.targetLangs,['en','zh','ja','vi','mn']);
  assert.match(html,/동시통역 자막 \(오늘부터\)/);assert.match(html,/통역 자막 시작/);assert.match(html,/\/live\/church\/\?mode=studio&amp;activity=sunday&amp;date=2026-10-25/);
});
test('October 25 is archived in the weekly index after November 1 is prepared',()=>{
  const weekly=JSON.parse(readFileSync(new URL('../worship/weekly.json',import.meta.url),'utf8'));
  assert.equal(weekly.services.find(s=>s.date==='2026-10-25').status,'archived');
});

test('Online bulletin and sermon mirror the weekly Google documents',()=>{
  for(let i=1;i<=28;i++)assert.ok(readFileSync(new URL(`../worship/2026-10-25/slides/${String(i).padStart(2,'0')}.webp`,import.meta.url)).length>5000);
  assert.equal((html.match(/class="bp-sheet"/g)||[]).length,3);
  for(const part of ['This Week’s Scripture for Meditation and Sharing','Community Announce','Community Confession','Those who serve','[Community Sunday Worship Service]','[Worship committee]','[Sponsor or Cooperation(ABC)]','[Application question]','355 0088 5391 83'])assert.ok(html.includes(part),part);
  assert.doesNotMatch(html,/임진명/,'personal recovery prayer stays off the public web');
  const sermon=get('sermon/index.html');
  assert.match(sermon,/<h1>261025 \| 에코디교회 주일모임 말씀나눔<\/h1>/);
  assert.match(sermon,/첫째 \| 재난을 구경하는 신앙을 멈추십시오/);assert.match(sermon,/마침기도/);
  assert.doesNotMatch(sermon,/예배 전 확인/,'internal checklist is not published');
});
