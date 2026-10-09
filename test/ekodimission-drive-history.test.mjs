import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFile(path.join(root,'space',name),'utf8');
test('EKODI Mission archive restores documented activity years and does not publish private student data',async()=>{
  const [home,activities,stories,history,partners,vision]=await Promise.all([
    read('ekodimission.page'),read('ekodimission-activities.page'),
    read('ekodimission-stories.page'),read('ekodimission-history.page'),read('ekodimission-partners.page'),
    read('ekodimission-vision.page')
  ]);
  for(const year of ['2018','2021','2022','2023','2024','2025','2026'])assert.match(activities,new RegExp('data-year="'+year+'"'));
  for(const anchor of ['2018','2023','2025','2026'])assert.ok(history.includes('id="history-'+anchor+'"'));
  assert.ok((activities.match(/data-activity-item/g)||[]).length>=14);
  assert.ok(activities.includes("2026 제주 여름캠프"));
  assert.ok(activities.includes("2022 서울 공동체 여행"));
  assert.ok(!activities.includes('datetime="2018-08-13"'),"Conflicting founding day must not be asserted");
  assert.match(activities,/data-year="2018" data-month=""[\s\S]*?<time datetime="2018">/,"Unknown founding month must not be indexed as August");
  assert.ok(!home.includes('RECENT ACTIVITY · 2026'));
  assert.ok(home.includes('진행·예정 행사'));
  assert.ok(home.includes('data-mission-home-event'));
  assert.equal([...home.matchAll(/<section\b/g)].length,2,'The home should show only introduction and current events');
  assert.ok(!activities.includes('mission-status upcoming'));
  assert.ok(!stories.includes('첫 활동은 2026년 9월 26일 진행 예정'));
  assert.ok(home.includes('/ekodimission/activities'));
  assert.ok(partners.includes('함께할 수 있는 네 가지 길'));
  assert.ok(vision.includes('2018년 설립 이후'));
  for(const page of [home,activities,stories,history,partners,vision]){
    assert.ok(page.includes('data-mission-nav'),'Shared public navigation must remain');
    assert.ok(page.includes('/ekodimission/assets/shell.js'),'Shared shell must remain');
    assert.ok(!page.includes('1995년'),'No student birth dates');
    assert.ok(!page.includes('SUMLUT JA RING'),'No student full name');
    assert.ok(!page.includes('docs.google.com/document/d/'),'No links to internal documents');
  }
});
test('Mission activity archive remains newest-first and filterable by calendar year',async()=>{
 const html=await read('ekodimission-activities.page');
 const dates=[...html.matchAll(/<time datetime="(\d{4}(?:-\d{2}(?:-\d{2})?)?)"/g)].map(m=>m[1]);
 assert.ok(dates.length>=14);
 assert.deepEqual(dates,[...dates].sort().reverse());
 assert.ok(html.includes('<time datetime="2023-10"><strong>10월</strong>'),'Unknown exact day must not be invented');
 assert.ok(html.includes('<time datetime="2018"><strong>2018</strong>'),'Contradictory founding month/day must not be invented');
 assert.ok(html.includes('<time datetime="2023-11"><strong>11월</strong>'),'Unknown exact day must not be invented');
 for(const section of html.split('<article class="mission-activity-row').slice(1)){
  assert.ok(section.includes('data-activity-item'));
  assert.match(section,/data-year="\d{4}"/);
  assert.match(section,/data-month="(?:\d{2})?"/);
 }
});
