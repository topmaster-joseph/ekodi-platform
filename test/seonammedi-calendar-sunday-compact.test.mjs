import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const js=await readFile(new URL('../sites/seonammedi/public/calendar-sidebar.js',import.meta.url),'utf8');
const css=await readFile(new URL('../sites/seonammedi/public/calendar-sidebar.css',import.meta.url),'utf8');

test('Sunday is the first column, including October 2026 and six-week months',()=>{
  assert.match(js,/WEEK=\['일','월','화','수','목','금','토'\]/);
  assert.match(js,/offset=new Date\(Date.UTC\(year,n-1,1\)\).getUTCDay\(\)/);
  assert.match(js,/weekday=WEEK\[new Date\(Date.UTC\(year,n-1,d\)\).getUTCDay\(\)\]/);
  assert.doesNotMatch(js,/getUTCDay\(\)\+6/);
  const monthOffset=(y,m)=>new Date(Date.UTC(y,m-1,1)).getUTCDay();
  assert.equal(monthOffset(2026,10),4,'2026-10-01 must be Thursday, fifth column');
  assert.equal(monthOffset(2026,11),0,'2026-11-01 must be Sunday, first column');
  assert.equal(monthOffset(2026,8),6,'August 2026 starts on Saturday');
  const rows=(y,m)=>Math.ceil((monthOffset(y,m)+new Date(Date.UTC(y,m,0)).getUTCDate())/7);
  assert.equal(rows(2026,8),6,'six-week calendar retains all rows');
});

test('compact vertical rows preserve at least 44px mobile touch target',()=>{
  assert.match(css,/\.seonam-calendar-card \.seonam-calendar-grid\{row-gap:4px;column-gap:2px\}/);
  assert.match(css,/\.seonam-calendar-card \.seonam-calendar-day\{[^}]*min-height:44px/);
  assert.match(css,/@media\(max-width:940px\)\{\.seonam-calendar-card \.seonam-calendar-day\{min-height:44px/);
  assert.match(css,/\.seonam-calendar-day\.has-events \.seonam-calendar-dot/);
});
