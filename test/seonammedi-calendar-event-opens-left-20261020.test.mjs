import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 2026-10-20 owner requests: (1) home 공지사항 rows open the top 공지 menu screen (board), not the events view;
// (2) a 주요일정 title in the right calendar opens that event in the left content area, with a cleaner layout.
const pub=p=>readFile(new URL('../sites/seonammedi/public/'+p,import.meta.url),'utf8');
const [cal,app,css,feed]=await Promise.all([pub('calendar-sidebar.js'),pub('app.js'),pub('app.css'),pub('home-public-feed.js')]);

test('calendar event titles link to the event detail and open in place when the home app is present',()=>{
  assert.match(cal,/a\.href=siteMount\(\)\+'\/notices\/'\+encodeURIComponent\(item\.id\)/);
  assert.match(cal,/typeof window\.seonamOpenEvent==='function'&&window\.seonamOpenEvent\(item\.id\)/);
  assert.equal((cal.match(/eventTitle\(item\)/g)||[]).length,2,'both today and day lists use the link');
});

test('home app opens the event in the left area and closing returns home',()=>{
  assert.match(app,/window\.seonamOpenEvent=id=>\{/);
  assert.match(app,/history\.pushState\(null,'',noticePermalink\(item\.id\)\);showView\('notices'\);showNoticeDetail\(item\)/);
  assert.match(app,/class="notice-back" aria-label="일정 닫기">닫기 ✕<\/button>/);
  assert.match(app,/history\.pushState\(null,'',siteMountBase\(\)\);showView\(''\)/);
  assert.match(css,/#notices \.module-intro,#notices \.module-toolbar\{display:none!important\}/);
});

test('home 공지사항 is board-only and follows the board order',()=>{
  assert.doesNotMatch(feed,/fetchJson\('\/api\/seonammedi\/notices'\)/);
  assert.match(feed,/HOME-NOTICES-BOARD-ONLY-001/);
});
