import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {suppressSupersededTimeline} from '../seonammedi-admin-control.js';

// Owner request (2026-10-19): 활동이력 must list one event once, and collapsed
// cards keep date, title and share on one line.

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const ARTICLE='https://www.docdocdoc.co.kr/news/articleView.html?idxno=3042961';
const activity={id:29,date:'2026.09.21',recordScope:'committee',title:'국회·민주당사·청와대 상경투쟁',links:[{url:'https://dudlsen.tistory.com/2263'},{url:ARTICLE}],media:[]};
const schedule={id:20,date:'2026.09.21',recordScope:'news',category:'비대위 활동',title:'서울 상경투쟁 및 기자회견·공개서한 일정',links:[{url:ARTICLE+'/'}],media:[]};

test('a news row sharing date and source with a committee activity is dropped publicly',()=>{
  const out=suppressSupersededTimeline([schedule,activity]);
  assert.deepEqual(out.map(item=>item.id),[29]);
});

test('different dates, different sources, or no sources are kept',()=>{
  const otherDay={...schedule,id:21,date:'2026.09.20'};
  const otherSource={...schedule,id:22,links:[{url:'https://example.org/a'}]};
  const noSource={...schedule,id:23,links:[],media:[]};
  const out=suppressSupersededTimeline([activity,otherDay,otherSource,noSource]);
  assert.deepEqual(out.map(item=>item.id),[29,21,22,23]);
});

test('without committee activities the list is unchanged',()=>{
  const rows=[schedule,{...schedule,id:24}];
  assert.equal(suppressSupersededTimeline(rows),rows);
});

test('public app mirrors the rule for committee news and related news',async()=>{
  const app=await read('sites/seonammedi/public/app.js');
  assert.match(app,/function dropSupersededTimeline\(rows\)/);
  assert.match(app,/basePublicTimelineEntries=dropSupersededTimeline\(/);
  assert.match(app,/if\(item\?\.status\|\|isCommitteeRecord\(item\)\)return true;/);
});

test('collapsed cards align date, title and share on one row',async()=>{
  const css=await read('sites/seonammedi/public/shared-site-header.css');
  assert.match(css,/\.timeline-item\.is-collapsed \.timeline-content\{display:flex;align-items:center/);
  assert.match(css,/\.timeline-item\.is-collapsed \.item-share-row\{flex:0 0 auto;margin:0\}/);
});

test('auto-collected articles already cited by a same-day committee activity are not re-listed',async()=>{
  const app=await read('sites/seonammedi/public/app.js');
  const merge=app.slice(app.indexOf('function mergeMonitorTimelineItems'),app.indexOf('function applyMonitorTimelineUpdates'));
  assert.match(merge,/rows\.some\(row=>isCommitteeRecord\(row\)&&row\.date===date&&\[\.\.\.\(row\.links\|\|\[\]\),\.\.\.\(row\.media\|\|\[\]\)\]\.some\(link=>timelineNormalizeUrl\(link\.url\)===url\)\)\)continue;/);
  assert.ok(merge.indexOf('isCommitteeRecord(row)&&row.date===date')<merge.indexOf('rows.push('),'skip must happen before an auto row is added');
});
