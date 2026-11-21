import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../worship/bulletin-data.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../worship/bulletin-layout-20261122.css', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../worship/WEEKLY_RULES.md', import.meta.url), 'utf8');
const old = readFileSync(new URL('../worship/2026-11-08/index.html', import.meta.url), 'utf8');
const expected = [
  '경배찬양',
  '예배부름',
  '입례찬송',
  '공동고백',
  '회개찬송',
  '대표기도',
  '말씀봉독',
  '말씀찬송',
  '말씀선포',
  '말씀기도',
  '결단찬송',
  '교회소식',
  '파송찬송',
  '주기도문'
];
test('Nov 22 worship order is exactly fourteen bilingual steps in requested sequence', () => {
  const block = source.match(/const newOrder = \[([\s\S]*?)\n  \];/)?.[1];
  assert.ok(block, 'canonical, effective-dated worship order');
  const items = JSON.parse('[' + block + ']');
  assert.deepEqual(items.map(row => row[0]), expected);
  assert.equal(items.length, 14);
  for (const row of items) assert.ok(row[1].length > 4, 'English must be present');
});
test('layout places service order on left and committee, cooperation, one question on right; archive intact', () => {
  assert.match(source, /const orderEffectiveDate = '2026-11-22'/);
  assert.match(source, /if \(!hasNewOrder\) return/);
  assert.match(source, /left\.prepend\(order\)/);
  assert.match(source, /right\.append\(sponsorsHeading, sponsors\)/);
  assert.match(source, /right\.append\(questionsHeading, questions\)/);
  assert.match(source, /slice\(0, hasNewOrder \? 1 : undefined\)/);
  assert.match(source, /querySelectorAll\('li'\)\)\.slice\(1\)/);
  assert.match(css, /data-worship-layout="2026-11-22"/);
  assert.match(rules, /2026년 11월 22일/);
  assert.match(old, /<td>예배부름<\/td><th>Call to Worship<\/th>/);
  assert.doesNotMatch(old, /Processional Hymn/);
});

test('Nov 22 draft bulletin is two-sheet, sanitized and guarded', () => {
  const html = readFileSync(new URL('../worship/2026-11-22/index.html', import.meta.url), 'utf8');
  const stage = readFileSync(new URL('../worship/2026-11-22/worship.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../worship/2026-11-22/materials.json', import.meta.url), 'utf8'));
  const weekly = JSON.parse(readFileSync(new URL('../worship/weekly.json', import.meta.url), 'utf8'));
  assert.equal((html.match(/class="bp-sheet"/g) || []).length, 2);
  assert.equal((html.match(/<tr><td class="bp-order-ko">경배찬양/g) || []).length, 1);
  assert.equal((html.match(/<li>성령께서 내게/g) || []).length, 1);
  assert.match(html, /\.\.\/bulletin-data\.js\?v=20261122b/);
  assert.match(html, /\.\.\/review-gate\.js/);
  assert.doesNotMatch(html, /임진명|국화축제|sb_secret|service_role|stream_key/);
  assert.match(html, /<h1 id="worship-title">공동의 유익을 위한 은사<\/h1>/);
  assert.match(stage, /2026-11-22/);
  assert.match(stage, /'ekodi-church-worship-20261122'/);
  assert.equal(manifest.status, 'draft');
  assert.equal(manifest.reviewRequired, true);
  assert.equal(weekly.services.some(x => x.date === '2026-11-22'), false, 'draft stays out of published weekly index until pastor approval');
});

test('worship source and dated presentation agree about repentance, liturgy, and committee location',()=>{
 const html=readFileSync(new URL('../worship/2026-11-22/index.html',import.meta.url),'utf8');
 const stage=readFileSync(new URL('../worship/2026-11-22/worship.js',import.meta.url),'utf8');
 const second=html.slice(html.indexOf('aria-label="주보 2면"'));
 const order=second.indexOf('class="bp-order"'), committee=second.indexOf('data-b="committee"'),sponsors=second.indexOf('data-b="sponsors"'),question=second.indexOf('data-b="questions"');
 assert.ok(order>=0 && committee>order && sponsors>committee && question>sponsors);
 assert.match(html, /회개찬송<\/td><td class="bp-order-en">Hymn of Repentance/);
 assert.doesNotMatch(html, /헌금찬송|Offertory Hymn/);
 const slideBlock=stage.match(/const slides = ([\s\S]*?);\n\n  const storageKey/)[1];
 const slides=JSON.parse(slideBlock);
 assert.deepEqual(slides.slice(1).map(x=>x.title),expected);
 assert.equal(slides.find(x=>x.title==='회개찬송').kicker,'Hymn of Repentance');
});

test('four aligned columns present songs, passage, title and audience roles',()=>{
 const html=readFileSync(new URL('../worship/2026-11-22/index.html',import.meta.url),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('../worship/2026-11-22/materials.json',import.meta.url),'utf8'));
 const table=html.match(/<table class="bp-worship-table">([\s\S]*?)<\/table>/)?.[1];
 assert.ok(table);
 assert.equal((table.match(/<tr><td class="bp-order-ko">/g)||[]).length,14);
 assert.equal((table.match(/class="bp-order-detail"/g)||[]).length,14);
 assert.equal((table.match(/class="bp-order-actor"/g)||[]).length,14);
 for(const song of ['은혜','날구원하신주','지금까지','거룩하신 하나님','나 주님의 기쁨되기','아 하나님의 은혜로','성령이여 강림하사','주 안에 우린 하나']){
   assert.ok(table.includes(song),'missing hymn '+song);
 }
 assert.ok(table.includes('고린도전서 12:1–11'));
 assert.ok(table.includes('공동의 유익을 위한 은사'));
 assert.ok(table.includes('예배 15분 전'));
 assert.deepEqual(manifest.worship_details['경배찬양'],['은혜','날구원하신주','지금까지']);
 const stage=readFileSync(new URL('../worship/2026-11-22/worship.js',import.meta.url),'utf8');
 for(const song of ['은혜','날구원하신주','지금까지','거룩하신 하나님','나 주님의 기쁨되기','아 하나님의 은혜로','성령이여 강림하사','주 안에 우린 하나']) assert.ok(stage.includes(song));
});
test('annual worship committee displays this week in second date and date edits require admin',()=>{
 const controller=readFileSync(new URL('../worship/bulletin-data.js',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../mypage/app.js',import.meta.url),'utf8');
 const adminHtml=readFileSync(new URL('../mypage/index.html',import.meta.url),'utf8');
 const annual=JSON.parse(readFileSync(new URL('../worship/committee-2026.json',import.meta.url),'utf8'));
 const sql=readFileSync(new URL('../../../supabase/migrations/20261122020000_church_annual_worship_committee.sql',import.meta.url),'utf8');
 assert.match(controller,/\[-7, 0, 7, 14, 21\]/);
 assert.match(controller,/i === 1 \? ' class="bp-now"/);
 assert.match(controller,/church_worship_committee_assignments/);
 assert.match(admin,/annualSundayValid/);
 assert.match(admin,/current_site_access/);
 assert.match(admin,/resolution=merge-duplicates/);
 assert.match(adminHtml,/연간 예배위원 관리/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/tenant_admin/);
 assert.equal(annual.records.find(x=>x.date==='2026-11-22')?.prayer_leader,'두본요');
 assert.equal(annual.roles[0].title,'경배찬양');
});

test('four standing-service markers, bilingual legend and top-right photo frame',()=>{
 const html=readFileSync(new URL('../worship/2026-11-22/index.html',import.meta.url),'utf8');
 const first=html.slice(html.indexOf('aria-label="주보 1면"'),html.indexOf('aria-label="주보 2면"'));
 assert.match(first,/class="bp-photo bp-photo-required"/);
 assert.match(first,/PHOTO \/ IMAGE/);
 assert.doesNotMatch(first,/data-b="photo" hidden/);
 assert.match(source,/photo\.hidden = false/);
 assert.match(source,/standingServices\.has\(ko\)/);
 assert.match(html,/\(\* 표시는 일어서서 \/ \* Please stand\.\)/);
 for(const label of ['예배부름','입례찬송','파송찬송','주기도문']){
   assert.match(html,new RegExp('class="bp-order-ko">\\* '+label+'<\\/td>'));
 }
 assert.match(css,/\.bp-photo-required/);
});
